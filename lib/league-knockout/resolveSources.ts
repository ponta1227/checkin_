import { buildStandings } from "@/lib/leagues/buildStandings";

type SupabaseLike = {
  from: (table: string) => any;
};

type GroupRow = {
  id: string;
  group_no: number;
  name: string | null;
};

type GroupMemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type LeagueMatchRow = {
  id: string;
  group_id: string;
  round_no: number;
  slot_no: number;
  match_no: number;
  table_no: string | null;
  player1_entry_id: string;
  player2_entry_id: string;
  referee_entry_id: string | null;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string;
};

type BracketMatchRow = {
  id: string;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  source_group_id_1: string | null;
  source_rank_1: number | null;
  source_group_id_2: string | null;
  source_rank_2: number | null;
};

function canResolveRank(rank: number | null | undefined) {
  return typeof rank === "number" && Number.isInteger(rank) && rank >= 1;
}

export async function resolveLeagueKnockoutSources(params: {
  supabase: SupabaseLike;
  divisionId: string;
}) {
  const { supabase, divisionId } = params;

  const { data: groupsData, error: groupsError } = await supabase
    .from("league_groups")
    .select("id, group_no, name")
    .eq("division_id", divisionId)
    .order("group_no", { ascending: true });

  if (groupsError) {
    throw new Error(`リーグ取得に失敗しました: ${groupsError.message}`);
  }

  const groups = (groupsData ?? []) as GroupRow[];
  if (groups.length === 0) return;

  const groupIds = groups.map((g) => g.id);

  const { data: entriesData, error: entriesError } = await supabase
    .from("entries")
    .select(`
      id,
      players (
        id,
        name,
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  if (entriesError) {
    throw new Error(`参加者取得に失敗しました: ${entriesError.message}`);
  }

  const entryMap = new Map<string, any>();
  for (const entry of entriesData ?? []) {
    entryMap.set(entry.id, entry);
  }

  const { data: membersData, error: membersError } = await supabase
    .from("league_group_members")
    .select("id, group_id, entry_id, slot_no")
    .in("group_id", groupIds)
    .order("slot_no", { ascending: true });

  if (membersError) {
    throw new Error(`リーグメンバー取得に失敗しました: ${membersError.message}`);
  }

  const { data: matchesData, error: matchesError } = await supabase
    .from("league_matches")
    .select(`
      id,
      group_id,
      round_no,
      slot_no,
      match_no,
      table_no,
      player1_entry_id,
      player2_entry_id,
      referee_entry_id,
      winner_entry_id,
      score_text,
      status
    `)
    .in("group_id", groupIds);

  if (matchesError) {
    throw new Error(`リーグ試合取得に失敗しました: ${matchesError.message}`);
  }

  const members = (membersData ?? []) as GroupMemberRow[];
  const leagueMatches = (matchesData ?? []) as LeagueMatchRow[];

  const membersByGroup = new Map<string, GroupMemberRow[]>();
  for (const member of members) {
    if (!membersByGroup.has(member.group_id)) {
      membersByGroup.set(member.group_id, []);
    }
    membersByGroup.get(member.group_id)!.push(member);
  }

  const matchesByGroup = new Map<string, LeagueMatchRow[]>();
  for (const match of leagueMatches) {
    if (!matchesByGroup.has(match.group_id)) {
      matchesByGroup.set(match.group_id, []);
    }
    matchesByGroup.get(match.group_id)!.push(match);
  }

  const resolvedEntryByGroupRank = new Map<string, string>();

  for (const group of groups) {
    const groupMembers = [...(membersByGroup.get(group.id) ?? [])].sort(
      (a, b) => a.slot_no - b.slot_no
    );
    const groupMatchList = matchesByGroup.get(group.id) ?? [];

    if (groupMembers.length === 0) continue;

    const standings = buildStandings({
      groupMembers,
      groupMatches: groupMatchList,
      entryMap,
    });

    standings.forEach((row: { entry_id: string }, index: number) => {
      const rank = index + 1;
      resolvedEntryByGroupRank.set(`${group.id}:${rank}`, row.entry_id);
    });
  }

  const { data: bracketsData, error: bracketsError } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  if (bracketsError) {
    throw new Error(`トーナメント取得に失敗しました: ${bracketsError.message}`);
  }

  const bracketIds = (bracketsData ?? []).map((b: { id: string }) => b.id);
  if (bracketIds.length === 0) return;

  const { data: bracketMatchesData, error: bracketMatchesError } = await supabase
    .from("matches")
    .select(`
      id,
      player1_entry_id,
      player2_entry_id,
      source_group_id_1,
      source_rank_1,
      source_group_id_2,
      source_rank_2
    `)
    .in("bracket_id", bracketIds);

  if (bracketMatchesError) {
    throw new Error(`トーナメント試合取得に失敗しました: ${bracketMatchesError.message}`);
  }

  const bracketMatches = (bracketMatchesData ?? []) as BracketMatchRow[];

  for (const match of bracketMatches) {
    let nextPlayer1 = match.player1_entry_id;
    let nextPlayer2 = match.player2_entry_id;

    if (match.source_group_id_1 && canResolveRank(match.source_rank_1)) {
      nextPlayer1 =
        resolvedEntryByGroupRank.get(
          `${match.source_group_id_1}:${match.source_rank_1}`
        ) ?? null;
    }

    if (match.source_group_id_2 && canResolveRank(match.source_rank_2)) {
      nextPlayer2 =
        resolvedEntryByGroupRank.get(
          `${match.source_group_id_2}:${match.source_rank_2}`
        ) ?? null;
    }

    const changed =
      nextPlayer1 !== match.player1_entry_id || nextPlayer2 !== match.player2_entry_id;

    if (!changed) continue;

    const { error: updateError } = await supabase
      .from("matches")
      .update({
        player1_entry_id: nextPlayer1,
        player2_entry_id: nextPlayer2,
      })
      .eq("id", match.id);

    if (updateError) {
      throw new Error(`トーナメント反映に失敗しました: ${updateError.message}`);
    }
  }
}
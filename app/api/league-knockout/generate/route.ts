import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStandings } from "@/lib/leagues/buildStandings";
import { normalizeDivisionFormat } from "@/lib/divisions/format";
import { resolveLeagueKnockoutSources } from "@/lib/league-knockout/resolveSources";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type GroupRow = {
  id: string;
  group_no: number;
  name: string;
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

type KnockoutSource = {
  group_id: string;
  rank: number;
};

type MatchSeedPayload = {
  source1: KnockoutSource | null;
  source2: KnockoutSource | null;
};

type EntryPlayerRow = {
  id: string;
  name: string | null;
  affiliation: string | null;
};

type EntrySelectRow = {
  id: string;
  players: EntryPlayerRow[] | null;
};

type EntryMapValue = {
  id: string;
  players: EntryPlayerRow | null;
};

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function generateSeedOrder(size: number): number[] {
  if (size === 1) return [1];

  const prev = generateSeedOrder(size / 2);
  const result: number[] = [];

  for (const seed of prev) {
    result.push(seed);
    result.push(size + 1 - seed);
  }

  return result;
}

function isPlaceholderPlay(value: KnockoutSource | null) {
  return !!value && value.group_id === "__play__";
}

function compressByeOnlyRound(
  slots: Array<KnockoutSource | null>
): Array<KnockoutSource | null> {
  if (slots.length <= 2) return [...slots];

  const next: Array<KnockoutSource | null> = [];

  for (let i = 0; i < slots.length; i += 2) {
    const left = slots[i] ?? null;
    const right = slots[i + 1] ?? null;

    if (left && !right) {
      next.push(left);
    } else if (!left && right) {
      next.push(right);
    } else if (!left && !right) {
      next.push(null);
    } else {
      next.push({ group_id: "__play__", rank: i / 2 + 1 });
    }
  }

  return next;
}

function findFirstPlayableRoundIndex(
  initialSlots: Array<KnockoutSource | null>
) {
  let roundIndex = 0;
  let current = [...initialSlots];

  while (current.length > 1) {
    let hasRealPlay = false;
    let hasSingleByeAdvance = false;

    for (let i = 0; i < current.length; i += 2) {
      const left = current[i] ?? null;
      const right = current[i + 1] ?? null;

      if (left && right) {
        hasRealPlay = true;
      } else if ((left && !right) || (!left && right)) {
        hasSingleByeAdvance = true;
      }
    }

    if (hasRealPlay) {
      return roundIndex;
    }

    if (!hasSingleByeAdvance) {
      return roundIndex;
    }

    current = compressByeOnlyRound(current);
    roundIndex += 1;
  }

  return roundIndex;
}

function buildSlotsForRound(
  initialSlots: Array<KnockoutSource | null>,
  targetRoundIndex: number
): Array<KnockoutSource | null> {
  let current = [...initialSlots];

  for (let i = 0; i < targetRoundIndex; i += 1) {
    current = compressByeOnlyRound(current);
  }

  return current;
}

function buildRoundSeedPayloads(params: {
  initialSlots: Array<KnockoutSource | null>;
  firstPlayableRoundIndex: number;
}) {
  const { initialSlots, firstPlayableRoundIndex } = params;

  const roundSlots = buildSlotsForRound(initialSlots, firstPlayableRoundIndex);
  const payloads: MatchSeedPayload[] = [];

  for (let i = 0; i < roundSlots.length; i += 2) {
    const left = roundSlots[i] ?? null;
    const right = roundSlots[i + 1] ?? null;

    payloads.push({
      source1: isPlaceholderPlay(left) ? null : left,
      source2: isPlaceholderPlay(right) ? null : right,
    });
  }

  return payloads;
}

async function cleanupExistingBracket(params: {
  supabase: ServerSupabaseClient;
  divisionId: string;
  bracketType: string;
}) {
  const { supabase, divisionId, bracketType } = params;

  const { data: oldBracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId)
    .eq("bracket_type", bracketType)
    .maybeSingle();

  if (!oldBracket?.id) return;

  const { data: oldMatches } = await supabase
    .from("matches")
    .select("id, status")
    .eq("bracket_id", oldBracket.id);

  const hasCompleted = (oldMatches ?? []).some((m) => m.status === "completed");
  if (hasCompleted) {
    throw new Error(`${bracketType} に結果入力済みの試合があるため再生成できません。`);
  }

  await supabase.from("matches").delete().eq("bracket_id", oldBracket.id);
  await supabase.from("brackets").delete().eq("id", oldBracket.id);
}

async function createBracket(params: {
  supabase: ServerSupabaseClient;
  divisionId: string;
  bracketType: string;
  sources: KnockoutSource[];
}) {
  const { supabase, divisionId, bracketType, sources } = params;

  await cleanupExistingBracket({
    supabase,
    divisionId,
    bracketType,
  });

  const { data: insertedBracket, error: bracketError } = await supabase
    .from("brackets")
    .insert({
      division_id: divisionId,
      bracket_type: bracketType,
    })
    .select("id")
    .single();

  if (bracketError || !insertedBracket) {
    throw new Error(`brackets追加失敗: ${bracketError?.message ?? "unknown"}`);
  }

  const bracketId = insertedBracket.id;
  const bracketSize = nextPowerOfTwo(sources.length);
  const totalRounds = Math.log2(bracketSize);

  const roundRows: Array<Array<{ id: string; match_no: number }>> = [];

  for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
    const numMatches = bracketSize / Math.pow(2, roundNo);
    const rows = Array.from({ length: numMatches }, (_, index) => ({
      bracket_id: bracketId,
      round_no: roundNo,
      match_no: index + 1,
      status: "pending",
    }));

    const { data: insertedMatches, error } = await supabase
      .from("matches")
      .insert(rows)
      .select("id, match_no");

    if (error) {
      throw new Error(`matches追加失敗: ${error.message}`);
    }

    roundRows.push(
      [...(insertedMatches ?? [])].sort((a, b) => a.match_no - b.match_no) as Array<{
        id: string;
        match_no: number;
      }>
    );
  }

  for (let roundIndex = 0; roundIndex < roundRows.length - 1; roundIndex += 1) {
    const currentRound = roundRows[roundIndex];
    const nextRound = roundRows[roundIndex + 1];

    for (let matchIndex = 0; matchIndex < currentRound.length; matchIndex += 1) {
      const currentMatch = currentRound[matchIndex];
      const nextMatch = nextRound[Math.floor(matchIndex / 2)];
      const nextSlot = matchIndex % 2 === 0 ? 1 : 2;

      await supabase
        .from("matches")
        .update({
          next_match_id: nextMatch.id,
          next_slot: nextSlot,
        })
        .eq("id", currentMatch.id);
    }
  }

  const seedOrder = generateSeedOrder(bracketSize);
  const initialSlots: Array<KnockoutSource | null> = Array(bracketSize).fill(null);

  for (let i = 0; i < sources.length; i += 1) {
    const seedPos = seedOrder[i] - 1;
    initialSlots[seedPos] = sources[i];
  }

  const firstPlayableRoundIndex = findFirstPlayableRoundIndex(initialSlots);
  const firstPlayableRoundNo = firstPlayableRoundIndex + 1;

  const seedPayloads = buildRoundSeedPayloads({
    initialSlots,
    firstPlayableRoundIndex,
  });

  const targetRoundRows = roundRows[firstPlayableRoundIndex] ?? [];

  for (let i = 0; i < targetRoundRows.length; i += 1) {
    const targetMatch = targetRoundRows[i];
    const payload = seedPayloads[i] ?? { source1: null, source2: null };

    await supabase
      .from("matches")
      .update({
        source_group_id_1: payload.source1?.group_id ?? null,
        source_rank_1: payload.source1?.rank ?? null,
        source_group_id_2: payload.source2?.group_id ?? null,
        source_rank_2: payload.source2?.rank ?? null,
        status: "pending",
      })
      .eq("id", targetMatch.id);
  }

  for (let roundNo = 1; roundNo < firstPlayableRoundNo; roundNo += 1) {
    const hiddenRound = roundRows[roundNo - 1] ?? [];
    for (const match of hiddenRound) {
      await supabase
        .from("matches")
        .update({
          status: "skipped",
          source_group_id_1: null,
          source_rank_1: null,
          source_group_id_2: null,
          source_rank_2: null,
        })
        .eq("id", match.id);
    }
  }

  return bracketId;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: division } = await supabase
      .from("divisions")
      .select("id, format, league_knockout_mode")
      .eq("id", divisionId)
      .single();

    if (!division || normalizeDivisionFormat(division.format) !== "league_then_knockout") {
      return new Response("この種目はリーグ→トーナメントではありません", {
        status: 400,
      });
    }

    const knockoutMode = division.league_knockout_mode ?? "by_rank";

    const { data: groupsData, error: groupsError } = await supabase
      .from("league_groups")
      .select("id, group_no, name")
      .eq("division_id", divisionId)
      .order("group_no", { ascending: true });

    if (groupsError) {
      return new Response(`リーグ取得に失敗しました: ${groupsError.message}`, {
        status: 500,
      });
    }

    const groups = (groupsData ?? []) as GroupRow[];
    if (groups.length === 0) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league-knockout?error=no_league`,
          request.url
        )
      );
    }

    const groupIds = groups.map((group) => group.id);

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
      return new Response(`参加者取得に失敗しました: ${entriesError.message}`, {
        status: 500,
      });
    }

    const entryMap = new Map<string, EntryMapValue>();
    for (const rawEntry of (entriesData ?? []) as EntrySelectRow[]) {
      const firstPlayer =
        Array.isArray(rawEntry.players) && rawEntry.players.length > 0
          ? rawEntry.players[0]
          : null;

      entryMap.set(rawEntry.id, {
        id: rawEntry.id,
        players: firstPlayer
          ? {
              id: firstPlayer.id,
              name: firstPlayer.name,
              affiliation: firstPlayer.affiliation,
            }
          : null,
      });
    }

    const { data: membersData, error: membersError } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", groupIds)
      .order("slot_no", { ascending: true });

    if (membersError) {
      return new Response(`リーグメンバー取得に失敗しました: ${membersError.message}`, {
        status: 500,
      });
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
      return new Response(`リーグ試合取得に失敗しました: ${matchesError.message}`, {
        status: 500,
      });
    }

    const members = (membersData ?? []) as GroupMemberRow[];
    const matches = (matchesData ?? []) as LeagueMatchRow[];

    const membersByGroup = new Map<string, GroupMemberRow[]>();
    for (const member of members) {
      if (!membersByGroup.has(member.group_id)) {
        membersByGroup.set(member.group_id, []);
      }
      membersByGroup.get(member.group_id)!.push(member);
    }

    const matchesByGroup = new Map<string, LeagueMatchRow[]>();
    for (const match of matches) {
      if (!matchesByGroup.has(match.group_id)) {
        matchesByGroup.set(match.group_id, []);
      }
      matchesByGroup.get(match.group_id)!.push(match);
    }

    const rankBuckets = new Map<number, KnockoutSource[]>();
    let maxRankCount = 0;

    for (const group of groups) {
      const groupMembers = [...(membersByGroup.get(group.id) ?? [])].sort(
        (a, b) => a.slot_no - b.slot_no
      );
      const groupMatches = matchesByGroup.get(group.id) ?? [];

      buildStandings({
        groupMembers,
        groupMatches,
        entryMap,
      });

      const size = groupMembers.length;
      if (size > maxRankCount) maxRankCount = size;

      for (let rank = 1; rank <= size; rank += 1) {
        if (!rankBuckets.has(rank)) {
          rankBuckets.set(rank, []);
        }
        rankBuckets.get(rank)!.push({
          group_id: group.id,
          rank,
        });
      }
    }

    if (knockoutMode === "upper_lower") {
      const splitRank = Math.ceil(maxRankCount / 2);

      const upperSources: KnockoutSource[] = [];
      const lowerSources: KnockoutSource[] = [];

      for (const [rank, rows] of [...rankBuckets.entries()].sort((a, b) => a[0] - b[0])) {
        if (rank <= splitRank) {
          upperSources.push(...rows);
        } else {
          lowerSources.push(...rows);
        }
      }

      if (upperSources.length >= 2) {
        await createBracket({
          supabase,
          divisionId,
          bracketType: "upper",
          sources: upperSources,
        });
      }

      if (lowerSources.length >= 2) {
        await createBracket({
          supabase,
          divisionId,
          bracketType: "lower",
          sources: lowerSources,
        });
      }
    } else {
      const ranks = [...rankBuckets.keys()].sort((a, b) => a - b);

      for (const rank of ranks) {
        const sources = rankBuckets.get(rank) ?? [];
        if (sources.length < 2) continue;

        await createBracket({
          supabase,
          divisionId,
          bracketType: `rank_${rank}`,
          sources,
        });
      }
    }

    await resolveLeagueKnockoutSources({
      supabase,
      divisionId,
    });

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league-knockout?generated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "順位別トーナメント生成に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
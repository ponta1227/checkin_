import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicTeamProgressClient from "@/components/PublicTeamProgressClient";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";
import { formatLeagueSourceLabel } from "@/lib/team/displaySources";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
    token: string;
  }>;
};

function getBracketLabel(bracketType: string) {
  if (bracketType === "main") return "本戦";
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType || "-";
}

function resolveTeamDisplayName(params: {
  entryId: string | null | undefined;
  entryMap: Map<
    string,
    {
      id: string;
      entry_name: string | null;
      entry_affiliation: string | null;
      team_members: string[] | null;
    }
  >;
  sourceType: string | null | undefined;
  sourceGroupNo: number | null | undefined;
  sourceRank: number | null | undefined;
}) {
  const { entryId, entryMap, sourceType, sourceGroupNo, sourceRank } = params;

  if (entryId) {
    return entryMap.get(String(entryId))?.entry_name ?? "未定";
  }

  return formatLeagueSourceLabel({
    sourceType,
    groupNo: sourceGroupNo,
    rank: sourceRank,
  });
}

export default async function PublicProgressTokenPage({ params }: PageProps) {
  const { tournamentId, divisionId, token } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select("id, name, event_type, public_access_token")
    .eq("id", divisionId)
    .single();

  if (divisionError || !division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目情報を取得できませんでした。</p>
        <p>{divisionError?.message ?? "division not found"}</p>
      </main>
    );
  }

  if (!division.public_access_token) {
    return (
      <main style={{ padding: "24px" }}>
        <p>この種目にはまだ公開トークンが設定されていません。</p>
        <p>管理画面で「公開トークンを再発行」してください。</p>
      </main>
    );
  }

  if (division.public_access_token !== token) {
    return (
      <main style={{ padding: "24px" }}>
        <p>この進行確認ページにはアクセスできません。</p>
        <p>URLが古い可能性があります。管理者から最新URLを受け取ってください。</p>
      </main>
    );
  }

  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("id, entry_name, entry_affiliation, team_members")
    .eq("division_id", divisionId);

  if (entriesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>エントリー情報を取得できませんでした。</p>
        <p>{entriesError.message}</p>
      </main>
    );
  }

  const typedEntries =
    (entries as Array<{
      id: string;
      entry_name: string | null;
      entry_affiliation: string | null;
      team_members: string[] | null;
    }> | null) ?? [];

  const entryMap = new Map(typedEntries.map((e) => [String(e.id), e] as const));

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(`
      id,
      round_no,
      match_no,
      status,
      score_text,
      player1_entry_id,
      player2_entry_id,
      winner_entry_id,
      bracket_id,
      league_group_no,
      player1_source_type,
      player1_source_group_no,
      player1_source_rank,
      player2_source_type,
      player2_source_group_no,
      player2_source_rank
    `)
    .eq("division_id", divisionId)
    .neq("status", "skipped")
    .order("league_group_no", { ascending: true, nullsFirst: false })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  if (matchesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>試合情報を取得できませんでした。</p>
        <p>{matchesError.message}</p>
      </main>
    );
  }

  const typedMatches =
    (matches as Array<{
      id: string;
      round_no: number | null;
      match_no: number | null;
      status: string | null;
      score_text: string | null;
      player1_entry_id: string | null;
      player2_entry_id: string | null;
      winner_entry_id: string | null;
      bracket_id: string | null;
      league_group_no: number | null;
      player1_source_type: string | null;
      player1_source_group_no: number | null;
      player1_source_rank: number | null;
      player2_source_type: string | null;
      player2_source_group_no: number | null;
      player2_source_rank: number | null;
    }> | null) ?? [];

  const { data: brackets, error: bracketsError } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  if (bracketsError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>ブラケット情報を取得できませんでした。</p>
        <p>{bracketsError.message}</p>
      </main>
    );
  }

  const typedBrackets =
    (brackets as Array<{
      id: string;
      bracket_type: string | null;
    }> | null) ?? [];

  const bracketTypeMap = new Map<string, string>();
  for (const bracket of typedBrackets) {
    bracketTypeMap.set(String(bracket.id), String(bracket.bracket_type ?? ""));
  }

  const leagueMatches = typedMatches.filter((m) => !m.bracket_id);

  const groupedStandings = buildTeamLeagueStandingsByGroup({
    entries: typedEntries.map((e) => ({
      id: e.id,
      entry_name: e.entry_name,
      entry_affiliation: e.entry_affiliation,
    })),
    matches: leagueMatches.map((m) => ({
      id: m.id,
      player1_entry_id: m.player1_entry_id,
      player2_entry_id: m.player2_entry_id,
      winner_entry_id: m.winner_entry_id,
      score_text: m.score_text,
      status: m.status,
      league_group_no: m.league_group_no,
    })),
  });

  const leagueGroupNos = Array.from(
    new Set(
      leagueMatches
        .map((m) => m.league_group_no)
        .filter((v): v is number => Number.isInteger(v))
    )
  );

  const { data: leagueCourtAssignments, error: leagueCourtError } =
    leagueGroupNos.length > 0
      ? await supabase
          .from("division_league_court_assignments")
          .select("division_id, league_group_no, slot_no, court_no")
          .eq("division_id", divisionId)
          .in("league_group_no", leagueGroupNos)
          .order("slot_no", { ascending: true })
      : { data: [], error: null };

  if (leagueCourtError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>リーグコート情報を取得できませんでした。</p>
        <p>{leagueCourtError.message}</p>
      </main>
    );
  }

  const typedLeagueCourtAssignments =
    (leagueCourtAssignments as Array<{
      division_id: string;
      league_group_no: number;
      slot_no: number;
      court_no: number;
    }> | null) ?? [];

  const leagueCourtMap = new Map<number, number[]>();
  for (const row of typedLeagueCourtAssignments) {
    if (!leagueCourtMap.has(row.league_group_no)) {
      leagueCourtMap.set(row.league_group_no, []);
    }
    leagueCourtMap.get(row.league_group_no)!.push(row.court_no);
  }

  const matchIds = typedMatches.map((m) => m.id);

  const { data: matchTableAssignments, error: matchTableError } =
    matchIds.length > 0
      ? await supabase
          .from("match_table_assignments")
          .select("match_id, slot_no, table_no")
          .in("match_id", matchIds)
          .order("slot_no", { ascending: true })
      : { data: [], error: null };

  if (matchTableError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>トーナメントコート情報を取得できませんでした。</p>
        <p>{matchTableError.message}</p>
      </main>
    );
  }

  const typedMatchTableAssignments =
    (matchTableAssignments as Array<{
      match_id: string;
      slot_no: number;
      table_no: number;
    }> | null) ?? [];

  const matchCourtMap = new Map<string, number[]>();
  for (const row of typedMatchTableAssignments) {
    if (!matchCourtMap.has(row.match_id)) {
      matchCourtMap.set(row.match_id, []);
    }
    matchCourtMap.get(row.match_id)!.push(row.table_no);
  }

  const leagueBoards = groupedStandings.map((group) => {
    const groupMatchList = leagueMatches.filter(
      (m) => Number(m.league_group_no ?? 1) === group.groupNo
    );

    const teamIds = Array.from(
      new Set(
        groupMatchList
          .flatMap((m) => [m.player1_entry_id, m.player2_entry_id])
          .filter(Boolean)
      )
    ) as string[];

    const teams = teamIds.map((id) => ({
      entryId: String(id),
      teamName: entryMap.get(String(id))?.entry_name ?? "未定",
    }));

    const cells = groupMatchList
      .filter((m) => m.player1_entry_id && m.player2_entry_id)
      .map((m) => ({
        matchId: m.id,
        rowEntryId: String(m.player1_entry_id),
        colEntryId: String(m.player2_entry_id),
        status: m.status,
        scoreText: m.score_text,
        roundNo: m.round_no,
      }));

    return {
      groupNo: group.groupNo,
      assignedCourts: leagueCourtMap.get(group.groupNo) ?? [],
      teams,
      cells,
      standings: group.standings,
    };
  });

  const knockoutMatches = typedMatches
    .filter((m) => !!m.bracket_id)
    .map((match) => {
      const bracketType = match.bracket_id
        ? bracketTypeMap.get(String(match.bracket_id)) ?? "main"
        : "main";

      return {
        matchId: match.id,
        bracketLabel: getBracketLabel(bracketType),
        roundNo: match.round_no ?? 0,
        matchNo: match.match_no ?? 0,
        team1Name: resolveTeamDisplayName({
          entryId: match.player1_entry_id,
          entryMap,
          sourceType: match.player1_source_type,
          sourceGroupNo: match.player1_source_group_no,
          sourceRank: match.player1_source_rank,
        }),
        team2Name: resolveTeamDisplayName({
          entryId: match.player2_entry_id,
          entryMap,
          sourceType: match.player2_source_type,
          sourceGroupNo: match.player2_source_group_no,
          sourceRank: match.player2_source_rank,
        }),
        status: match.status,
        scoreText: match.score_text,
        assignedCourts: matchCourtMap.get(match.id) ?? [],
      };
    });

  const orderMemberOptions = typedEntries.map((entry) => ({
    entryId: entry.id,
    teamName: entry.entry_name ?? "-",
    members: Array.isArray(entry.team_members) ? entry.team_members : [],
  }));

  return (
    <PublicTeamProgressClient
      tournamentId={tournamentId}
      divisionId={divisionId}
      divisionName={division.name ?? "-"}
      leagueBoards={leagueBoards}
      knockoutMatches={knockoutMatches}
      orderMemberOptions={orderMemberOptions}
    />
  );
}
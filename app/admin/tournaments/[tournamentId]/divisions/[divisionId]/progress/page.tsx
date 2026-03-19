import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicTeamProgressClient from "@/components/PublicTeamProgressClient";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
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

export default async function PublicProgressPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type")
    .eq("id", divisionId)
    .single();

  const { data: entries } = await supabase
    .from("entries")
    .select("id, entry_name, entry_affiliation, team_members")
    .eq("division_id", divisionId);

  const entryMap = new Map((entries ?? []).map((e: any) => [e.id, e]));

  const { data: matches } = await supabase
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
      league_group_no
    `)
    .eq("division_id", divisionId)
    .neq("status", "skipped")
    .order("league_group_no", { ascending: true, nullsFirst: false })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  const bracketTypeMap = new Map<string, string>();
  for (const bracket of brackets ?? []) {
    bracketTypeMap.set(bracket.id, String(bracket.bracket_type ?? ""));
  }

  const leagueMatches = (matches ?? []).filter((m: any) => !m.bracket_id);

  const groupedStandings = buildTeamLeagueStandingsByGroup({
    entries: (entries ?? []).map((e: any) => ({
      id: e.id,
      entry_name: e.entry_name,
      entry_affiliation: e.entry_affiliation,
    })),
    matches: leagueMatches.map((m: any) => ({
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
    new Set(leagueMatches.map((m: any) => m.league_group_no).filter((v: any) => Number.isInteger(v)))
  );

  const { data: leagueCourtAssignments } =
    leagueGroupNos.length > 0
      ? await supabase
          .from("division_league_court_assignments")
          .select("division_id, league_group_no, slot_no, court_no")
          .eq("division_id", divisionId)
          .in("league_group_no", leagueGroupNos)
          .order("slot_no", { ascending: true })
      : { data: [] as any[] };

  const leagueCourtMap = new Map<number, number[]>();
  for (const row of leagueCourtAssignments ?? []) {
    if (!leagueCourtMap.has(row.league_group_no)) leagueCourtMap.set(row.league_group_no, []);
    leagueCourtMap.get(row.league_group_no)!.push(row.court_no);
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);
  const { data: matchTableAssignments } =
    matchIds.length > 0
      ? await supabase
          .from("match_table_assignments")
          .select("match_id, slot_no, table_no")
          .in("match_id", matchIds)
          .order("slot_no", { ascending: true })
      : { data: [] as any[] };

  const matchCourtMap = new Map<string, number[]>();
  for (const row of matchTableAssignments ?? []) {
    if (!matchCourtMap.has(row.match_id)) matchCourtMap.set(row.match_id, []);
    matchCourtMap.get(row.match_id)!.push(row.table_no);
  }

  const leagueBoards = groupedStandings.map((group: any) => {
    const groupMatchList = leagueMatches.filter((m: any) => Number(m.league_group_no ?? 1) === group.groupNo);

    const teamIds = Array.from(
      new Set(groupMatchList.flatMap((m: any) => [m.player1_entry_id, m.player2_entry_id]).filter(Boolean))
    ) as string[];

    const teams = teamIds.map((id) => ({
      entryId: id,
      teamName: entryMap.get(id)?.entry_name ?? "-",
    }));

    const cells = groupMatchList
      .filter((m: any) => m.player1_entry_id && m.player2_entry_id)
      .map((m: any) => ({
        matchId: m.id,
        rowEntryId: m.player1_entry_id,
        colEntryId: m.player2_entry_id,
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

  const knockoutMatches = (matches ?? [])
    .filter((m: any) => !!m.bracket_id)
    .map((match: any) => {
      const bracketType = match.bracket_id
        ? bracketTypeMap.get(match.bracket_id) ?? "main"
        : "main";

      return {
        matchId: match.id,
        bracketLabel: getBracketLabel(bracketType),
        roundNo: match.round_no,
        matchNo: match.match_no,
        team1Name: entryMap.get(match.player1_entry_id)?.entry_name ?? "未定",
        team2Name: entryMap.get(match.player2_entry_id)?.entry_name ?? "未定",
        status: match.status,
        scoreText: match.score_text,
        assignedCourts: matchCourtMap.get(match.id) ?? [],
      };
    });

  const orderMemberOptions = (entries ?? []).map((entry: any) => ({
    entryId: entry.id,
    teamName: entry.entry_name ?? "-",
    members: Array.isArray(entry.team_members) ? entry.team_members : [],
  }));

  return (
    <PublicTeamProgressClient
      tournamentId={tournamentId}
      divisionId={divisionId}
      divisionName={division?.name ?? "-"}
      leagueBoards={leagueBoards}
      knockoutMatches={knockoutMatches}
      orderMemberOptions={orderMemberOptions}
    />
  );
}
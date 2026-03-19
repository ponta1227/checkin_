import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";
import TeamLeaguePrintBoard from "@/components/TeamLeaguePrintBoard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function TeamLeaguePrintPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, format, team_match_format")
    .eq("id", divisionId)
    .single();

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  if (division.format !== "league" && division.format !== "league_then_knockout") {
    return (
      <main style={{ padding: "24px" }}>
        <p>この印刷ページは団体戦リーグ用です。</p>
      </main>
    );
  }

  const { data: entries } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      status,
      ranking_for_draw,
      affiliation_order
    `)
    .eq("division_id", divisionId)
    .neq("status", "withdrawn")
    .order("ranking_for_draw", { ascending: true, nullsFirst: false })
    .order("affiliation_order", { ascending: true, nullsFirst: false })
    .order("entry_name", { ascending: true });

  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id,
      player1_entry_id,
      player2_entry_id,
      winner_entry_id,
      status,
      score_text,
      bracket_id,
      league_group_no,
      round_no,
      match_no
    `)
    .eq("division_id", divisionId)
    .is("bracket_id", null)
    .neq("status", "skipped")
    .order("league_group_no", { ascending: true, nullsFirst: false })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const groupedStandings = buildTeamLeagueStandingsByGroup({
    entries:
      (entries ?? []).map((e) => ({
        id: e.id,
        entry_name: e.entry_name,
        entry_affiliation: e.entry_affiliation,
      })) ?? [],
    matches:
      (matches ?? []).map((m) => ({
        id: m.id,
        player1_entry_id: m.player1_entry_id,
        player2_entry_id: m.player2_entry_id,
        winner_entry_id: m.winner_entry_id,
        score_text: m.score_text,
        status: m.status,
        league_group_no: m.league_group_no,
      })) ?? [],
  });

  const entryMap = new Map(
    (entries ?? []).map((entry) => [
      entry.id,
      {
        entryId: entry.id,
        teamName: entry.entry_name ?? "-",
        rankingForDraw: entry.ranking_for_draw ?? Number.MAX_SAFE_INTEGER,
        affiliationOrder: entry.affiliation_order ?? Number.MAX_SAFE_INTEGER,
      },
    ])
  );

  const boards = groupedStandings.map((group) => {
    const groupMatchList = (matches ?? []).filter(
      (m) => Number(m.league_group_no ?? 1) === group.groupNo
    );

    const teamIds = Array.from(
      new Set(
        groupMatchList.flatMap((m) => [m.player1_entry_id, m.player2_entry_id]).filter(Boolean)
      )
    ) as string[];

    const teams = teamIds
      .map((id) => entryMap.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a!.rankingForDraw !== b!.rankingForDraw) {
          return a!.rankingForDraw - b!.rankingForDraw;
        }
        if (a!.affiliationOrder !== b!.affiliationOrder) {
          return a!.affiliationOrder - b!.affiliationOrder;
        }
        return a!.teamName.localeCompare(b!.teamName, "ja");
      })
      .map((team) => ({
        entryId: team!.entryId,
        teamName: team!.teamName,
      }));

    const cells = groupMatchList
      .filter((m) => m.player1_entry_id && m.player2_entry_id)
      .map((m) => ({
        matchId: m.id,
        rowEntryId: m.player1_entry_id as string,
        colEntryId: m.player2_entry_id as string,
        scoreText: m.score_text,
        status: m.status,
      }));

    return {
      groupNo: group.groupNo,
      teams,
      cells,
      standings: group.standings,
    };
  });

  return (
    <>
      <div className="no-print" style={{ padding: "16px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <TeamLeaguePrintBoard
        tournamentName={tournament?.name ?? "-"}
        divisionName={division.name}
        teamMatchFormat={division.team_match_format ?? null}
        boards={boards}
      />
    </>
  );
}
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamLeagueBoardClient from "@/components/TeamLeagueBoardClient";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

function topLinkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    color: "inherit",
    textDecoration: "none",
  };
}

export default async function TeamLeaguePage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, format, team_match_format")
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  if (division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  if (division.format !== "league" && division.format !== "league_then_knockout") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
            ← 試合一覧へ戻る
          </Link>
        </div>
        <p>このリーグ表UIは league / league_then_knockout の団体戦に対応しています。</p>
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

  const leagueGroupNos = Array.from(
    new Set(
      (matches ?? [])
        .map((m) => m.league_group_no)
        .filter((v): v is number => Number.isInteger(v))
    )
  );

  const { data: leagueCourtAssignments } =
    leagueGroupNos.length > 0
      ? await supabase
          .from("division_league_court_assignments")
          .select("division_id, league_group_no, slot_no, court_no")
          .eq("division_id", divisionId)
          .in("league_group_no", leagueGroupNos)
          .order("slot_no", { ascending: true })
      : {
          data: [] as Array<{
            division_id: string;
            league_group_no: number;
            slot_no: number;
            court_no: number;
          }>,
        };

  const leagueCourtMap = new Map<number, number[]>();
  for (const row of leagueCourtAssignments ?? []) {
    if (!leagueCourtMap.has(row.league_group_no)) {
      leagueCourtMap.set(row.league_group_no, []);
    }
    leagueCourtMap.get(row.league_group_no)!.push(row.court_no);
  }

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

  return (
    <main style={{ padding: "24px", maxWidth: "1600px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`} style={topLinkStyle()}>
          種目管理へ
        </Link>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`} style={topLinkStyle()}>
          試合一覧へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>リーグ表</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {division.name} / 形式: {division.team_match_format ?? "-"}
      </p>

      {boards.length === 0 ? (
        <p>リーグがありません。</p>
      ) : (
        <TeamLeagueBoardClient
          tournamentId={tournamentId}
          divisionId={divisionId}
          boards={boards}
        />
      )}
    </main>
  );
}
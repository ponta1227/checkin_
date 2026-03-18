import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamLeagueBoardClient from "@/components/TeamLeagueBoardClient";
import { buildTeamLeagueStandings } from "@/lib/team/buildStandings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

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
      bracket_id
    `)
    .eq("division_id", divisionId)
    .is("bracket_id", null)
    .neq("status", "skipped");

  const teams =
    (entries ?? []).map((entry) => ({
      entryId: entry.id,
      teamName: entry.entry_name ?? "-",
      affiliation: entry.entry_affiliation ?? null,
    })) ?? [];

  const cells =
    (matches ?? [])
      .filter((m) => m.player1_entry_id && m.player2_entry_id)
      .map((m) => ({
        matchId: m.id,
        rowEntryId: m.player1_entry_id as string,
        colEntryId: m.player2_entry_id as string,
        status: m.status,
        scoreText: m.score_text,
      })) ?? [];

  const standings = buildTeamLeagueStandings({
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
      })) ?? [],
  });

  return (
    <main style={{ padding: "24px", maxWidth: "1600px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>リーグ表</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {division.name} / 形式: {division.team_match_format ?? "-"}
      </p>

      {teams.length === 0 ? (
        <p>チームがありません。</p>
      ) : (
        <TeamLeagueBoardClient
          tournamentId={tournamentId}
          divisionId={divisionId}
          teams={teams}
          cells={cells}
          standings={standings}
        />
      )}
    </main>
  );
}
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamLeagueStandings } from "@/lib/team/buildStandings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

type TeamRow = {
  entryId: string;
  teamName: string;
  affiliation: string | null;
};

type CellRow = {
  matchId: string;
  rowEntryId: string;
  colEntryId: string;
  status: string | null;
  scoreText: string | null;
};

type StandingRow = {
  entryId: string;
  teamName: string;
  teamAffiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  teamPointsFor: number;
  teamPointsAgainst: number;
  gamePointsFor: number;
  gamePointsAgainst: number;
  teamPointDiff: number;
  gamePointDiff: number;
  rank: number;
};

export default async function TeamLeaguePage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

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

  const teams: TeamRow[] =
    (entries ?? []).map((entry) => ({
      entryId: entry.id,
      teamName: entry.entry_name ?? "-",
      affiliation: entry.entry_affiliation ?? null,
    })) ?? [];

  const cells: CellRow[] =
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
  }) as StandingRow[];

  const cellMap = new Map<string, CellRow>();
  for (const cell of cells) {
    cellMap.set(`${cell.rowEntryId}:${cell.colEntryId}`, cell);
    cellMap.set(`${cell.colEntryId}:${cell.rowEntryId}`, {
      ...cell,
      rowEntryId: cell.colEntryId,
      colEntryId: cell.rowEntryId,
    });
  }

  const standingMap = new Map<string, StandingRow>();
  standings.forEach((row, index) => {
    standingMap.set(row.entryId, {
      ...row,
      rank: row.rank ?? index + 1,
    });
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
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: "48px" }}>No</th>
                <th style={{ ...thStyle, minWidth: "220px" }}>チーム</th>
                {teams.map((team, index) => (
                  <th key={team.entryId} style={{ ...thStyleCenter, minWidth: "72px" }}>
                    {index + 1}
                  </th>
                ))}
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>試合数</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>勝</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>敗</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>得点</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>失点</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>得失差</th>
                <th style={{ ...thStyleCenter, minWidth: "72px" }}>順位</th>
              </tr>
            </thead>

            <tbody>
              {teams.map((team, rowIndex) => {
                const standing = standingMap.get(team.entryId);

                return (
                  <tr key={team.entryId}>
                    <td style={tdStyleCenter}>{rowIndex + 1}</td>

                    <td style={tdStyleLeft}>
                      <div style={{ fontWeight: 600 }}>{team.teamName}</div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {team.affiliation ?? ""}
                      </div>
                    </td>

                    {teams.map((opponent) => {
                      if (team.entryId === opponent.entryId) {
                        return (
                          <td
                            key={opponent.entryId}
                            style={{
                              ...tdStyleCenter,
                              background:
                                "linear-gradient(to bottom right, transparent 48%, #333 49%, #333 51%, transparent 52%)",
                            }}
                          />
                        );
                      }

                      const cell = cellMap.get(`${team.entryId}:${opponent.entryId}`);

                      return (
                        <td key={opponent.entryId} style={tdStyleCenter}>
                          {cell?.scoreText ?? (cell?.status === "completed" ? "済" : "")}
                        </td>
                      );
                    })}

                    <td style={tdStyleCenter}>{standing?.played ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.wins ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.losses ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.teamPointsFor ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.teamPointsAgainst ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.teamPointDiff ?? "-"}</td>
                    <td style={tdStyleCenter}>{standing?.rank ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "white",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "10px 8px",
  background: "#f7f7f7",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const thStyleCenter: React.CSSProperties = {
  ...thStyle,
  textAlign: "center",
};

const tdStyleLeft: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  padding: "10px 8px",
  textAlign: "left",
  verticalAlign: "middle",
};

const tdStyleCenter: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  padding: "10px 8px",
  textAlign: "center",
  verticalAlign: "middle",
};
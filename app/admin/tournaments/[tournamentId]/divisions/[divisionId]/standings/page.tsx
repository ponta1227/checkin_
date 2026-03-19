import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamLeagueStandings } from "@/lib/team/buildStandings";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function TeamStandingsPage({ params }: PageProps) {
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
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  if (division.format !== "league") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
            ← 試合一覧へ戻る
          </Link>
        </div>
        <p>現段階では、順位表は団体戦リーグ戦にのみ対応しています。</p>
      </main>
    );
  }

  const { data: entries } = await supabase
    .from("entries")
    .select("id, entry_name, entry_affiliation, status")
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
      score_text,
      status
    `)
    .eq("division_id", divisionId)
    .neq("status", "skipped")
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

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
    <main style={{ padding: "24px", maxWidth: "1200px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦リーグ順位表</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name} / 形式:{" "}
        {division.team_match_format ?? "-"}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #eee",
            fontWeight: 700,
          }}
        >
          順位一覧
        </div>

        {standings.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    順位
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "left" }}>
                    チーム名
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "left" }}>
                    所属
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    試合数
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    勝
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    敗
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    団体得点
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    団体失点
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    団体得失差
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    ゲーム得点
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    ゲーム失点
                  </th>
                  <th style={{ padding: "12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                    ゲーム得失差
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => (
                  <tr key={row.entryId}>
                    <td
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid #f0f0f0",
                        textAlign: "center",
                        fontWeight: 700,
                      }}
                    >
                      {row.rank}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0" }}>
                      {row.teamName}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0" }}>
                      {row.teamAffiliation ?? "-"}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.played}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.wins}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.losses}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.teamPointsFor}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.teamPointsAgainst}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid #f0f0f0",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {row.teamPointDiff}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.gamePointsFor}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {row.gamePointsAgainst}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid #f0f0f0",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {row.gamePointDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "16px", color: "#666" }}>
            順位表を表示できるデータがありません。
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: "20px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          padding: "16px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "10px", fontSize: "18px" }}>
          現在の順位決定ルール
        </h2>
        <div style={{ color: "#555", lineHeight: 1.7 }}>
          勝数 → 敗数 → 団体得失差 → ゲーム得失差 → チーム名の順で並べています。
        </div>
      </section>
    </main>
  );
}
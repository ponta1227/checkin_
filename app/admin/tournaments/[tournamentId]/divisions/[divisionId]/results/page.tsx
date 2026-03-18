import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
  searchParams: Promise<{ saved?: string }>;
};

function getStatusLabel(status: string | null | undefined) {
  if (status === "ready") return "対戦可";
  if (status === "pending") return "未確定";
  if (status === "walkover") return "不戦";
  if (status === "completed") return "完了";
  return "-";
}

export default async function DivisionResultsPage({
  params,
  searchParams,
}: PageProps) {
  const { tournamentId, divisionId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("id", divisionId)
    .single();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  if (!division || !tournament) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>結果入力</h1>
        <p>大会または種目が見つかりませんでした。</p>
      </main>
    );
  }

  const { data: entries } = await supabase
    .from("entries")
    .select(`
      id,
      players (
        id,
        name
      )
    `)
    .eq("division_id", divisionId);

  const entryNameMap = new Map<string, string>();
  for (const entry of entries ?? []) {
    entryNameMap.set(entry.id, entry.players?.name ?? "-");
  }

  const { data: bracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId)
    .eq("bracket_type", "main")
    .maybeSingle();

  if (!bracket?.id) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}>
            ← 組み合わせへ戻る
          </Link>
        </div>
        <h1 style={{ marginBottom: "8px" }}>結果入力</h1>
        <p style={{ marginBottom: "8px" }}>大会: {tournament.name}</p>
        <p style={{ marginBottom: "24px" }}>種目: {division.name}</p>
        <p>まだ組み合わせが生成されていません。</p>
      </main>
    );
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, round_no, match_no, player1_entry_id, player2_entry_id, winner_entry_id, score_text, status"
    )
    .eq("bracket_id", bracket.id)
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const rounds = new Map<number, any[]>();
  for (const match of matches ?? []) {
    if (!rounds.has(match.round_no)) rounds.set(match.round_no, []);
    rounds.get(match.round_no)!.push(match);
  }

  const roundEntries = [...rounds.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}>
          ← 組み合わせへ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>結果入力</h1>
      <p style={{ marginBottom: "8px" }}>大会: {tournament.name}</p>
      <p style={{ marginBottom: "16px" }}>種目: {division.name}</p>

      {resolvedSearchParams.saved && (
        <p style={{ color: "green", marginBottom: "16px" }}>
          試合結果を保存し、レーティングを更新しました。
        </p>
      )}

      <p style={{ marginBottom: "24px", color: "#555" }}>
        過去試合を修正する場合は、なるべく早い回戦から順に見直してください。
      </p>

      {roundEntries.length === 0 ? (
        <p>試合がありません。</p>
      ) : (
        <div style={{ display: "grid", gap: "24px" }}>
          {roundEntries.map(([roundNo, roundMatches]) => (
            <div
              key={roundNo}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "16px" }}>{roundNo}回戦</h2>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                      試合
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                      player1
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                      player2
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                      状態
                    </th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                      入力
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roundMatches.map((match: any) => {
                    const p1Name = match.player1_entry_id
                      ? entryNameMap.get(match.player1_entry_id) ?? "-"
                      : match.player2_entry_id
                      ? "BYE"
                      : "-";

                    const p2Name = match.player2_entry_id
                      ? entryNameMap.get(match.player2_entry_id) ?? "-"
                      : match.player1_entry_id
                      ? "BYE"
                      : "-";

                    const hasBothPlayers =
                      !!match.player1_entry_id && !!match.player2_entry_id;

                    const currentWinnerId = match.winner_entry_id ?? "";

                    return (
                      <tr key={match.id}>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                          {match.match_no}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                          {p1Name}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                          {p2Name}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                          {getStatusLabel(match.status)}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                          {match.status === "walkover" ? (
                            <div>
                              <div>不戦勝で自動決定</div>
                              <div style={{ marginTop: "4px", color: "#555" }}>
                                勝者: {currentWinnerId ? entryNameMap.get(currentWinnerId) ?? "-" : "-"}
                              </div>
                            </div>
                          ) : !hasBothPlayers ? (
                            <div>対戦者確定待ち</div>
                          ) : (
                            <form action="/api/matches/report" method="post" style={{ display: "grid", gap: "8px" }}>
                              <input type="hidden" name="tournamentId" value={tournamentId} />
                              <input type="hidden" name="divisionId" value={divisionId} />
                              <input type="hidden" name="matchId" value={match.id} />

                              <select
                                name="winnerEntryId"
                                defaultValue={currentWinnerId}
                                required
                                style={{
                                  padding: "8px",
                                  border: "1px solid #ccc",
                                  borderRadius: "6px",
                                }}
                              >
                                <option value="">勝者を選択</option>
                                <option value={match.player1_entry_id}>
                                  {entryNameMap.get(match.player1_entry_id) ?? "-"}
                                </option>
                                <option value={match.player2_entry_id}>
                                  {entryNameMap.get(match.player2_entry_id) ?? "-"}
                                </option>
                              </select>

                              <input
                                type="text"
                                name="scoreText"
                                defaultValue={match.score_text ?? ""}
                                placeholder="例: 3-0"
                                style={{
                                  padding: "8px",
                                  border: "1px solid #ccc",
                                  borderRadius: "6px",
                                }}
                              />

                              <button
                                type="submit"
                                style={{
                                  padding: "8px 12px",
                                  border: "1px solid #ccc",
                                  borderRadius: "6px",
                                  background: "white",
                                  cursor: "pointer",
                                }}
                              >
                                保存
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
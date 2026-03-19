import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildTeamMatchBoards,
  needsFifthBoardInTLeague,
} from "@/lib/team/buildTeamMatchBoards";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
    matchId: string;
  }>;
};

function buildOrderLineLabel(matchType: "W" | "S" | "T", names: string[]) {
  if (matchType === "W") {
    return names.filter(Boolean).join(" / ");
  }
  return names[0] ?? "";
}

function countWins(games: Array<{ board_no: number; winner_side: string | null }>) {
  let team1Wins = 0;
  let team2Wins = 0;

  for (const game of games) {
    if (game.winner_side === "team1") team1Wins += 1;
    if (game.winner_side === "team2") team2Wins += 1;
  }

  return { team1Wins, team2Wins };
}

export default async function TeamScorePage({ params }: PageProps) {
  const { tournamentId, divisionId, matchId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, team_match_format")
    .eq("id", divisionId)
    .single();

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <p>この種目は団体戦ではありません。</p>
      </main>
    );
  }

  const format = String(division.team_match_format ?? "");
  const boards = buildTeamMatchBoards(format);

  const { data: match } = await supabase
    .from("matches")
    .select(`
      id,
      status,
      score_text,
      winner_entry_id,
      player1_entry_id,
      player2_entry_id
    `)
    .eq("id", matchId)
    .eq("division_id", divisionId)
    .single();

  if (!match) {
    return (
      <main style={{ padding: "24px" }}>
        <p>試合が見つかりませんでした。</p>
      </main>
    );
  }

  const entryIds = [match.player1_entry_id, match.player2_entry_id].filter(Boolean) as string[];

  const { data: entries } =
    entryIds.length > 0
      ? await supabase
          .from("entries")
          .select("id, entry_name, entry_affiliation")
          .in("id", entryIds)
      : { data: [] as any[] };

  const entryMap = new Map((entries ?? []).map((e) => [e.id, e]));
  const team1 = match.player1_entry_id ? entryMap.get(match.player1_entry_id) : null;
  const team2 = match.player2_entry_id ? entryMap.get(match.player2_entry_id) : null;

  const { data: orders } = await supabase
    .from("team_match_orders")
    .select("id, entry_id, is_locked")
    .eq("team_match_id", matchId);

  const team1Order = (orders ?? []).find((o) => o.entry_id === match.player1_entry_id);
  const team2Order = (orders ?? []).find((o) => o.entry_id === match.player2_entry_id);

  const bothSubmitted = !!team1Order?.is_locked && !!team2Order?.is_locked;

  const orderIds = (orders ?? []).map((o) => o.id);

  const { data: orderLines } =
    orderIds.length > 0
      ? await supabase
          .from("team_match_order_lines")
          .select(`
            id,
            team_match_order_id,
            board_no,
            match_type,
            member1_id,
            member2_id
          `)
          .in("team_match_order_id", orderIds)
      : { data: [] as any[] };

  const memberIds = Array.from(
    new Set(
      (orderLines ?? [])
        .flatMap((line) => [line.member1_id, line.member2_id])
        .filter(Boolean)
    )
  ) as string[];

  const { data: members } =
    memberIds.length > 0
      ? await supabase
          .from("team_members")
          .select("id, name")
          .in("id", memberIds)
      : { data: [] as any[] };

  const memberNameMap = new Map((members ?? []).map((m) => [m.id, m.name]));

  const linesByOrderIdBoard = new Map<string, any>();
  for (const line of orderLines ?? []) {
    linesByOrderIdBoard.set(`${line.team_match_order_id}-${line.board_no}`, line);
  }

  const { data: games } = await supabase
    .from("team_match_games")
    .select(`
      id,
      team_match_id,
      board_no,
      match_type,
      team1_label,
      team2_label,
      winner_side,
      score_text,
      game_scores,
      status
    `)
    .eq("team_match_id", matchId)
    .order("board_no", { ascending: true });

  const gameMap = new Map<number, any>();
  for (const game of games ?? []) {
    gameMap.set(game.board_no, game);
  }

  const winsAfter4 = countWins((games ?? []).filter((g) => g.board_no <= 4));
  const fifthEnabled =
    format === "T_LEAGUE" &&
    needsFifthBoardInTLeague({
      team1WinsAfterBoard4: winsAfter4.team1Wins,
      team2WinsAfterBoard4: winsAfter4.team2Wins,
    });

  return (
    <main style={{ padding: "24px", maxWidth: "1100px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦 結果入力</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {division.name} / 形式: {format}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          対戦カード
        </h2>
        <p style={{ margin: 0 }}>
          {team1?.entry_name ?? "チーム1未定"} vs {team2?.entry_name ?? "チーム2未定"}
        </p>
        <p style={{ marginTop: "8px", color: "#666" }}>
          団体戦スコア: {match.score_text ?? "-"} / 状態: {match.status ?? "-"}
        </p>
      </section>

      {!bothSubmitted ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <p style={{ margin: 0 }}>
            両チームのオーダー提出が完了していないため、結果入力はできません。
          </p>
          <div style={{ marginTop: "12px" }}>
            <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${matchId}/team-order`}>
              オーダー提出ページへ
            </Link>
          </div>
        </section>
      ) : (
        <section
          style={{
            display: "grid",
            gap: "16px",
          }}
        >
          {boards.map((board) => {
            const team1Line = team1Order
              ? linesByOrderIdBoard.get(`${team1Order.id}-${board.boardNo}`)
              : null;
            const team2Line = team2Order
              ? linesByOrderIdBoard.get(`${team2Order.id}-${board.boardNo}`)
              : null;

            const team1Names = [
              team1Line?.member1_id ? memberNameMap.get(team1Line.member1_id) ?? "-" : "",
              team1Line?.member2_id ? memberNameMap.get(team1Line.member2_id) ?? "-" : "",
            ].filter(Boolean);

            const team2Names = [
              team2Line?.member1_id ? memberNameMap.get(team2Line.member1_id) ?? "-" : "",
              team2Line?.member2_id ? memberNameMap.get(team2Line.member2_id) ?? "-" : "",
            ].filter(Boolean);

            const team1Label =
              team1Line && team1Names.length > 0
                ? buildOrderLineLabel(board.type, team1Names)
                : "未入力";
            const team2Label =
              team2Line && team2Names.length > 0
                ? buildOrderLineLabel(board.type, team2Names)
                : "未入力";

            const game = gameMap.get(board.boardNo);

            const disabledByTLeague =
              format === "T_LEAGUE" && board.boardNo === 5 && !fifthEnabled;

            return (
              <div
                key={board.boardNo}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "16px",
                  background: disabledByTLeague ? "#fafafa" : "white",
                }}
              >
                <div style={{ marginBottom: "12px" }}>
                  <strong>
                    {board.boardNo}番 ({board.type})
                  </strong>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "8px",
                      padding: "10px",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                      {team1?.entry_name ?? "チーム1"}
                    </div>
                    <div>{team1Label}</div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "8px",
                      padding: "10px",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                      {team2?.entry_name ?? "チーム2"}
                    </div>
                    <div>{team2Label}</div>
                  </div>
                </div>

                {disabledByTLeague ? (
                  <p style={{ margin: 0, color: "#666" }}>
                    4番終了時点で 2-2 の場合のみ 5番を入力します。
                  </p>
                ) : (
                  <form
                    action="/api/team-match-games/update"
                    method="post"
                    style={{ display: "grid", gap: "12px" }}
                  >
                    <input type="hidden" name="tournamentId" value={tournamentId} />
                    <input type="hidden" name="divisionId" value={divisionId} />
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="boardNo" value={board.boardNo} />
                    <input type="hidden" name="matchType" value={board.type} />
                    <input type="hidden" name="team1Label" value={team1Label} />
                    <input type="hidden" name="team2Label" value={team2Label} />

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "grid", gap: "6px" }}>
                        <label>勝者</label>
                        <select
                          name="winnerSide"
                          defaultValue={game?.winner_side ?? ""}
                          style={{
                            padding: "10px",
                            border: "1px solid #ccc",
                            borderRadius: "8px",
                            background: "white",
                          }}
                        >
                          <option value="">選択してください</option>
                          <option value="team1">{team1?.entry_name ?? "チーム1"}</option>
                          <option value="team2">{team2?.entry_name ?? "チーム2"}</option>
                        </select>
                      </div>

                      <div style={{ display: "grid", gap: "6px" }}>
                        <label>ゲーム数（左）</label>
                        <input
                          name="leftGames"
                          type="number"
                          min={0}
                          defaultValue={
                            game?.score_text?.includes("-")
                              ? String(game.score_text).split("-")[0]
                              : ""
                          }
                          style={{
                            padding: "10px",
                            border: "1px solid #ccc",
                            borderRadius: "8px",
                          }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: "6px" }}>
                        <label>ゲーム数（右）</label>
                        <input
                          name="rightGames"
                          type="number"
                          min={0}
                          defaultValue={
                            game?.score_text?.includes("-")
                              ? String(game.score_text).split("-")[1]
                              : ""
                          }
                          style={{
                            padding: "10px",
                            border: "1px solid #ccc",
                            borderRadius: "8px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <button
                        type="submit"
                        style={{
                          padding: "10px 14px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        この試合を登録
                      </button>
                    </div>

                    <div style={{ fontSize: "12px", color: "#666" }}>
                      現在の状態: {game?.status ?? "pending"} / スコア: {game?.score_text ?? "-"}
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
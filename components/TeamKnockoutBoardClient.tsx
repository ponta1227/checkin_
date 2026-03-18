"use client";

import { useMemo, useState } from "react";

type MatchCard = {
  matchId: string;
  bracketType: string;
  bracketLabel: string;
  roundNo: number;
  matchNo: number;
  team1Name: string;
  team2Name: string;
  status: string | null;
  scoreText: string | null;
  tableNo: number | null;
};

type BoardType = "W" | "S" | "T";

type OrderLineRow = {
  boardNo: number;
  matchType: BoardType;
  team1Label: string;
  team2Label: string;
};

type GameRow = {
  boardNo: number;
  matchType: BoardType;
  team1Label: string;
  team2Label: string;
  winnerSide: "team1" | "team2" | null;
  scoreText: string | null;
  status: string | null;
};

type MatchModalData = {
  matchId: string;
  team1Name: string;
  team2Name: string;
  team1EntryId: string | null;
  team2EntryId: string | null;
  matchStatus: string | null;
  teamScoreText: string | null;
  team1OrderSubmitted: boolean;
  team2OrderSubmitted: boolean;
  bothSubmitted: boolean;
  format: string | null;
  teamMatchFormat: string | null;
  orderLines: OrderLineRow[];
  games: GameRow[];
};

type EditableGameRow = {
  boardNo: number;
  matchType: BoardType;
  team1Label: string;
  team2Label: string;
  winnerSide: "" | "team1" | "team2";
  leftGames: string;
  rightGames: string;
  status: string | null;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  matches: MatchCard[];
};

type RoundData = {
  roundNo: number;
  matches: MatchCard[];
};

const CARD_WIDTH = 240;
const CARD_HEIGHT = 120;
const ROUND_GAP = 82;
const BASE_VERTICAL_GAP = 28;
const ROUND_TITLE_HEIGHT = 34;
const CONNECTOR_GAP = 22;

function parseScoreText(scoreText: string | null | undefined) {
  if (!scoreText || !scoreText.includes("-")) {
    return { left: "", right: "" };
  }
  const [left, right] = String(scoreText).split("-");
  return { left, right };
}

function getMatchNoColor(status: string | null | undefined, team1Name: string, team2Name: string) {
  const participantsFixed =
    !!team1Name &&
    !!team2Name &&
    team1Name !== "未定" &&
    team2Name !== "未定";

  if (!participantsFixed) return "#222";
  if (status === "completed") return "#888";
  if (status === "in_progress") return "#245dff";
  return "#d11";
}

function groupByBracket(matches: MatchCard[]) {
  const map = new Map<string, { label: string; matches: MatchCard[] }>();
  for (const match of matches) {
    const key = match.bracketType || "main";
    if (!map.has(key)) {
      map.set(key, {
        label: match.bracketLabel,
        matches: [],
      });
    }
    map.get(key)!.matches.push(match);
  }
  return Array.from(map.entries());
}

function buildRounds(matches: MatchCard[]): RoundData[] {
  const map = new Map<number, MatchCard[]>();
  for (const match of matches) {
    if (!map.has(match.roundNo)) map.set(match.roundNo, []);
    map.get(match.roundNo)!.push(match);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([roundNo, rows]) => ({
      roundNo,
      matches: [...rows].sort((a, b) => a.matchNo - b.matchNo),
    }));
}

function getRoundTop(roundIndex: number, matchIndex: number) {
  const block = CARD_HEIGHT + BASE_VERTICAL_GAP;
  return (
    matchIndex * block * Math.pow(2, roundIndex) +
    ((Math.pow(2, roundIndex) - 1) * block) / 2
  );
}

function getRoundHeight(rounds: RoundData[]) {
  if (rounds.length === 0) return CARD_HEIGHT + ROUND_TITLE_HEIGHT;

  let maxBottom = 0;
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((_, matchIndex) => {
      const top = getRoundTop(roundIndex, matchIndex);
      maxBottom = Math.max(maxBottom, top + CARD_HEIGHT);
    });
  });

  return maxBottom + ROUND_TITLE_HEIGHT + 8;
}

function BracketGroupBoard({
  groupLabel,
  groupMatches,
  onOpenMatch,
}: {
  groupLabel: string;
  groupMatches: MatchCard[];
  onOpenMatch: (matchId: string) => void;
}) {
  const rounds = useMemo(() => buildRounds(groupMatches), [groupMatches]);
  const boardHeight = useMemo(() => getRoundHeight(rounds), [rounds]);

  return (
    <section className="team-bracket-group">
      <div className="team-bracket-header">{groupLabel}</div>

      <div className="team-bracket-scroll">
        <div
          className="team-bracket-board"
          style={{
            width: rounds.length * (CARD_WIDTH + ROUND_GAP) + 80,
            height: boardHeight,
          }}
        >
          {rounds.map((round, roundIndex) => {
            const left = roundIndex * (CARD_WIDTH + ROUND_GAP);

            return (
              <div
                key={round.roundNo}
                className="team-bracket-round"
                style={{
                  left,
                  width: CARD_WIDTH + CONNECTOR_GAP + ROUND_GAP,
                  height: boardHeight,
                }}
              >
                <div className="team-bracket-round-title">{round.roundNo}回戦</div>

                {round.matches.map((match, matchIndex) => {
                  const top = ROUND_TITLE_HEIGHT + getRoundTop(roundIndex, matchIndex);
                  const hasNextRound = roundIndex < rounds.length - 1;
                  const isTopOfPair = matchIndex % 2 === 0;
                  const pairExists = matchIndex + 1 < round.matches.length;

                  return (
                    <div key={match.matchId}>
                      <div
                        className="team-bracket-card-wrap"
                        style={{
                          top,
                          left: 0,
                          width: CARD_WIDTH,
                          height: CARD_HEIGHT,
                        }}
                      >
                        <div className="team-bracket-card">
                          <div className="team-bracket-card-top">
                            <button
                              type="button"
                              className="team-bracket-matchno"
                              onClick={() => onOpenMatch(match.matchId)}
                              style={{
                                color: getMatchNoColor(
                                  match.status,
                                  match.team1Name,
                                  match.team2Name
                                ),
                              }}
                            >
                              第{match.matchNo}試合
                            </button>

                            <div className="team-bracket-table">台: {match.tableNo ?? "-"}</div>
                          </div>

                          <div className="team-bracket-teamline">
                            {match.team1Name || "未定"}
                          </div>
                          <div className="team-bracket-teamline">
                            {match.team2Name || "未定"}
                          </div>

                          <div className="team-bracket-score">
                            団体スコア: {match.scoreText ?? "-"}
                          </div>
                        </div>
                      </div>

                      {hasNextRound && (
                        <div
                          className="team-bracket-horizontal"
                          style={{
                            top: top + CARD_HEIGHT / 2,
                            left: CARD_WIDTH,
                            width: CONNECTOR_GAP,
                          }}
                        />
                      )}

                      {hasNextRound && isTopOfPair && pairExists && (
                        <>
                          <div
                            className="team-bracket-vertical"
                            style={{
                              left: CARD_WIDTH + CONNECTOR_GAP,
                              top: top + CARD_HEIGHT / 2,
                              height:
                                getRoundTop(roundIndex, matchIndex + 1) -
                                getRoundTop(roundIndex, matchIndex),
                            }}
                          />
                          <div
                            className="team-bracket-horizontal"
                            style={{
                              top:
                                ROUND_TITLE_HEIGHT +
                                getRoundTop(roundIndex + 1, Math.floor(matchIndex / 2)) +
                                CARD_HEIGHT / 2,
                              left: CARD_WIDTH + CONNECTOR_GAP,
                              width: ROUND_GAP - CONNECTOR_GAP,
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function TeamKnockoutBoardClient({
  tournamentId,
  divisionId,
  matches,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<MatchModalData | null>(null);
  const [editableGames, setEditableGames] = useState<EditableGameRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const grouped = useMemo(() => groupByBracket(matches), [matches]);

  async function openMatchModal(matchId: string) {
    setModalOpen(true);
    setSelectedMatchId(matchId);
    setLoading(true);
    setErrorMessage("");
    setModalData(null);
    setEditableGames([]);

    try {
      const res = await fetch(`/api/team-match-modal/read?matchId=${encodeURIComponent(matchId)}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "試合情報の取得に失敗しました。");
      }

      const data = (await res.json()) as MatchModalData;
      setModalData(data);

      const nextEditableGames: EditableGameRow[] = data.orderLines.map((line) => {
        const existing = data.games.find((g) => g.boardNo === line.boardNo);
        const parsed = parseScoreText(existing?.scoreText);

        return {
          boardNo: line.boardNo,
          matchType: line.matchType,
          team1Label: line.team1Label,
          team2Label: line.team2Label,
          winnerSide: existing?.winnerSide ?? "",
          leftGames: parsed.left,
          rightGames: parsed.right,
          status: existing?.status ?? null,
        };
      });

      setEditableGames(nextEditableGames);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "試合情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedMatchId(null);
    setModalData(null);
    setEditableGames([]);
    setErrorMessage("");
  }

  function updateGameRow(boardNo: number, patch: Partial<EditableGameRow>) {
    setEditableGames((prev) =>
      prev.map((row) => (row.boardNo === boardNo ? { ...row, ...patch } : row))
    );
  }

  async function saveBoard(boardNo: number) {
    if (!selectedMatchId) return;
    const row = editableGames.find((g) => g.boardNo === boardNo);
    if (!row) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/team-match-modal/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId,
          divisionId,
          matchId: selectedMatchId,
          boardNo: row.boardNo,
          matchType: row.matchType,
          team1Label: row.team1Label,
          team2Label: row.team2Label,
          winnerSide: row.winnerSide,
          leftGames: row.leftGames,
          rightGames: row.rightGames,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "結果保存に失敗しました。");
      }

      await openMatchModal(selectedMatchId);
      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "結果保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <style>{`
        .team-bracket-group {
          border: 1px solid #ddd;
          border-radius: 10px;
          background: white;
          overflow: hidden;
        }

        .team-bracket-header {
          padding: 14px 16px;
          border-bottom: 1px solid #eee;
          font-weight: 700;
        }

        .team-bracket-scroll {
          overflow-x: auto;
          padding: 16px;
        }

        .team-bracket-board {
          position: relative;
          min-width: fit-content;
        }

        .team-bracket-round {
          position: absolute;
          top: 0;
        }

        .team-bracket-round-title {
          position: absolute;
          top: 0;
          left: 0;
          font-weight: 700;
          font-size: 13px;
        }

        .team-bracket-card-wrap {
          position: absolute;
        }

        .team-bracket-card {
          border: 1px solid #222;
          border-radius: 8px;
          background: #fff;
          overflow: hidden;
          width: ${CARD_WIDTH}px;
          height: ${CARD_HEIGHT}px;
        }

        .team-bracket-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 8px 6px 8px;
          border-bottom: 1px solid #ddd;
          background: #fafafa;
        }

        .team-bracket-matchno {
          border: none;
          background: transparent;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }

        .team-bracket-table {
          font-size: 11px;
          color: #666;
          white-space: nowrap;
        }

        .team-bracket-teamline {
          min-height: 30px;
          padding: 7px 8px;
          border-bottom: 1px solid #eee;
          font-size: 12px;
          display: flex;
          align-items: center;
        }

        .team-bracket-teamline:last-of-type {
          border-bottom: none;
        }

        .team-bracket-score {
          padding: 6px 8px 8px 8px;
          font-size: 11px;
          color: #555;
          border-top: 1px solid #eee;
        }

        .team-bracket-horizontal {
          position: absolute;
          border-top: 1px solid #222;
        }

        .team-bracket-vertical {
          position: absolute;
          border-right: 1px solid #222;
        }
      `}</style>

      <div style={{ display: "grid", gap: "20px" }}>
        {grouped.map(([groupKey, group]) => (
          <BracketGroupBoard
            key={groupKey}
            groupLabel={group.label}
            groupMatches={group.matches}
            onOpenMatch={openMatchModal}
          />
        ))}
      </div>

      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "20px" }}>団体戦 トーナメント試合管理</h2>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>

            {loading ? (
              <p>読み込み中...</p>
            ) : errorMessage ? (
              <div
                style={{
                  padding: "12px",
                  border: "1px solid #f3c5c5",
                  background: "#fff6f6",
                  borderRadius: "8px",
                  color: "#a33",
                }}
              >
                {errorMessage}
              </div>
            ) : modalData ? (
              <div style={{ display: "grid", gap: "18px" }}>
                <section
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "14px",
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                    {modalData.team1Name} vs {modalData.team2Name}
                  </div>
                  <div style={{ color: "#666", fontSize: "14px" }}>
                    団体スコア: {modalData.teamScoreText ?? "-"} / 状態: {modalData.matchStatus ?? "-"}
                  </div>
                </section>

                <section
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "14px",
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "10px" }}>オーダー提出状況</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div>
                      {modalData.team1Name}: {modalData.team1OrderSubmitted ? "提出済" : "未提出"}
                    </div>
                    <div>
                      {modalData.team2Name}: {modalData.team2OrderSubmitted ? "提出済" : "未提出"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                    <a
                      href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${modalData.matchId}/team-order?team=team1`}
                      style={linkButtonStyle}
                    >
                      {modalData.team1Name} のオーダー提出
                    </a>
                    <a
                      href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${modalData.matchId}/team-order?team=team2`}
                      style={linkButtonStyle}
                    >
                      {modalData.team2Name} のオーダー提出
                    </a>
                  </div>
                </section>

                <section
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "14px",
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "12px" }}>番手別結果入力</div>

                  {!modalData.bothSubmitted ? (
                    <div style={{ color: "#666" }}>
                      両チームのオーダー提出が完了すると、ここで入力できます。
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "14px" }}>
                      {editableGames.map((row) => (
                        <div
                          key={row.boardNo}
                          style={{
                            border: "1px solid #eee",
                            borderRadius: "8px",
                            padding: "12px",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {row.boardNo}番 ({row.matchType})
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "10px",
                            }}
                          >
                            <div style={labelBoxStyle}>{row.team1Label}</div>
                            <div style={labelBoxStyle}>{row.team2Label}</div>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1.2fr 1fr 1fr auto",
                              gap: "10px",
                              alignItems: "end",
                            }}
                          >
                            <div style={{ display: "grid", gap: "6px" }}>
                              <label>勝者</label>
                              <select
                                value={row.winnerSide}
                                onChange={(e) =>
                                  updateGameRow(row.boardNo, {
                                    winnerSide: e.target.value as "" | "team1" | "team2",
                                  })
                                }
                                style={inputStyle}
                              >
                                <option value="">選択してください</option>
                                <option value="team1">{modalData.team1Name}</option>
                                <option value="team2">{modalData.team2Name}</option>
                              </select>
                            </div>

                            <div style={{ display: "grid", gap: "6px" }}>
                              <label>左ゲーム数</label>
                              <input
                                value={row.leftGames}
                                onChange={(e) =>
                                  updateGameRow(row.boardNo, {
                                    leftGames: e.target.value,
                                  })
                                }
                                type="number"
                                min={0}
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "grid", gap: "6px" }}>
                              <label>右ゲーム数</label>
                              <input
                                value={row.rightGames}
                                onChange={(e) =>
                                  updateGameRow(row.boardNo, {
                                    rightGames: e.target.value,
                                  })
                                }
                                type="number"
                                min={0}
                                style={inputStyle}
                              />
                            </div>

                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => saveBoard(row.boardNo)}
                              style={{
                                padding: "10px 14px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                                height: "42px",
                              }}
                            >
                              保存
                            </button>
                          </div>

                          <div style={{ fontSize: "12px", color: "#666" }}>
                            現在状態: {row.status ?? "pending"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

const linkButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  textDecoration: "none",
  color: "inherit",
  background: "white",
};

const labelBoxStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: "8px",
  padding: "10px",
};

const inputStyle: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
};
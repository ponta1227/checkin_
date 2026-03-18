"use client";

import { useMemo, useState, useTransition } from "react";

type TeamRow = {
  entryId: string;
  teamName: string;
};

type CellRow = {
  matchId: string;
  rowEntryId: string;
  colEntryId: string;
  status: string | null;
  scoreText: string | null;
  roundNo: number | null;
};

type StandingRow = {
  rank: number;
  entryId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  teamPointsFor: number;
  teamPointsAgainst: number;
  teamPointDiff: number;
};

type LeagueBoard = {
  groupNo: number;
  assignedCourts: number[];
  teams: TeamRow[];
  cells: CellRow[];
  standings: StandingRow[];
};

type KnockoutMatch = {
  matchId: string;
  bracketLabel: string;
  roundNo: number;
  matchNo: number;
  team1Name: string;
  team2Name: string;
  status: string | null;
  scoreText: string | null;
  assignedCourts: number[];
};

type BoardType = "W" | "S" | "T";

type OrderMemberOption = {
  entryId: string;
  teamName: string;
  members: string[];
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
  orderLines: Array<{
    boardNo: number;
    matchType: BoardType;
    team1Label: string;
    team2Label: string;
  }>;
  games: Array<{
    boardNo: number;
    matchType: BoardType;
    team1Label: string;
    team2Label: string;
    winnerSide: "team1" | "team2" | null;
    scoreText: string | null;
    status: string | null;
  }>;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  divisionName: string;
  leagueBoards: LeagueBoard[];
  knockoutMatches: KnockoutMatch[];
  orderMemberOptions: OrderMemberOption[];
};

type EditableGameRow = {
  boardNo: number;
  winnerSide: "" | "team1" | "team2";
  leftGames: string;
  rightGames: string;
};

type BoardDefinition = {
  boardNo: number;
  matchType: BoardType;
};

type OrderSelectionValue = {
  first: string;
  second: string;
};

const BRACKET_CARD_HEIGHT = 152;
const BRACKET_BASE_GAP = 28;
const BRACKET_COLUMN_GAP = 56;
const BRACKET_CARD_WIDTH = 220;

function buildBoardDefinitions(format: string | null | undefined): BoardDefinition[] {
  switch (format) {
    case "WSS":
      return [
        { boardNo: 1, matchType: "W" },
        { boardNo: 2, matchType: "S" },
        { boardNo: 3, matchType: "S" },
      ];
    case "WWW":
      return [
        { boardNo: 1, matchType: "W" },
        { boardNo: 2, matchType: "W" },
        { boardNo: 3, matchType: "W" },
      ];
    case "WSSSW":
      return [
        { boardNo: 1, matchType: "W" },
        { boardNo: 2, matchType: "S" },
        { boardNo: 3, matchType: "S" },
        { boardNo: 4, matchType: "S" },
        { boardNo: 5, matchType: "W" },
      ];
    case "WSSSS":
      return [
        { boardNo: 1, matchType: "W" },
        { boardNo: 2, matchType: "S" },
        { boardNo: 3, matchType: "S" },
        { boardNo: 4, matchType: "S" },
        { boardNo: 5, matchType: "S" },
      ];
    case "T_LEAGUE":
      return [
        { boardNo: 1, matchType: "S" },
        { boardNo: 2, matchType: "S" },
        { boardNo: 3, matchType: "W" },
        { boardNo: 4, matchType: "S" },
        { boardNo: 5, matchType: "S" },
      ];
    default:
      return [
        { boardNo: 1, matchType: "S" },
        { boardNo: 2, matchType: "S" },
        { boardNo: 3, matchType: "S" },
      ];
  }
}

function getStatusText(status: string | null | undefined, scoreText: string | null | undefined) {
  if (status === "completed") return scoreText ?? "完了";
  if (status === "in_progress") return "試合中";
  if (status === "ready") return "入力可能";
  if (status === "pending") return "未入力";
  return scoreText ?? "-";
}

function groupKnockoutMatches(knockoutMatches: KnockoutMatch[]) {
  const byBracket = new Map<string, KnockoutMatch[]>();

  for (const match of knockoutMatches) {
    if (!byBracket.has(match.bracketLabel)) {
      byBracket.set(match.bracketLabel, []);
    }
    byBracket.get(match.bracketLabel)!.push(match);
  }

  return Array.from(byBracket.entries()).map(([bracketLabel, matches]) => {
    const roundMap = new Map<number, KnockoutMatch[]>();

    for (const match of matches) {
      if (!roundMap.has(match.roundNo)) {
        roundMap.set(match.roundNo, []);
      }
      roundMap.get(match.roundNo)!.push(match);
    }

    const rounds = Array.from(roundMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([roundNo, roundMatches]) => ({
        roundNo,
        matches: [...roundMatches].sort((a, b) => a.matchNo - b.matchNo),
      }));

    return {
      bracketLabel,
      rounds,
    };
  });
}

function getRoundTopOffset(roundIndex: number) {
  if (roundIndex === 0) return 0;
  return ((BRACKET_CARD_HEIGHT + BRACKET_BASE_GAP) * (2 ** roundIndex - 1)) / 2;
}

function getRoundGap(roundIndex: number) {
  return (BRACKET_CARD_HEIGHT + BRACKET_BASE_GAP) * 2 ** roundIndex - BRACKET_CARD_HEIGHT;
}

function buildOrderText(matchType: BoardType, value: OrderSelectionValue) {
  if (matchType === "W") {
    if (!value.first || !value.second) return "";
    return `${value.first} / ${value.second}`;
  }
  return value.first;
}

export default function PublicTeamProgressClient({
  tournamentId,
  divisionId,
  divisionName,
  leagueBoards,
  knockoutMatches,
  orderMemberOptions,
}: Props) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<MatchModalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const [orderSide, setOrderSide] = useState<"team1" | "team2">("team1");
  const [orderSelections, setOrderSelections] = useState<Record<number, OrderSelectionValue>>({});
  const [editableGames, setEditableGames] = useState<EditableGameRow[]>([]);

  const [orderConfirmModalOpen, setOrderConfirmModalOpen] = useState(false);
  const [resultConfirmModalOpen, setResultConfirmModalOpen] = useState(false);

  const memberMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of orderMemberOptions) {
      map.set(row.entryId, row.members);
    }
    return map;
  }, [orderMemberOptions]);

  const boardDefinitions = useMemo(() => {
    if (!modalData) return [];
    const defs = buildBoardDefinitions(modalData.teamMatchFormat);
    if (modalData.orderLines && modalData.orderLines.length > 0) {
      return modalData.orderLines.map((line) => ({
        boardNo: line.boardNo,
        matchType: line.matchType,
      }));
    }
    return defs;
  }, [modalData]);

  const groupedBrackets = useMemo(
    () => groupKnockoutMatches(knockoutMatches),
    [knockoutMatches]
  );

  async function openMatch(matchId: string) {
    setSelectedMatchId(matchId);
    setModalData(null);
    setLoading(true);
    setMessage("");
    setOrderConfirmModalOpen(false);
    setResultConfirmModalOpen(false);

    try {
      const res = await fetch(`/api/team-match-modal/read?matchId=${encodeURIComponent(matchId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || "試合情報の取得に失敗しました。");

      const data = JSON.parse(text) as MatchModalData;
      setModalData(data);

      const defs =
        data.orderLines && data.orderLines.length > 0
          ? data.orderLines.map((line) => ({
              boardNo: line.boardNo,
              matchType: line.matchType,
            }))
          : buildBoardDefinitions(data.teamMatchFormat);

      const nextEditableGames = defs.map((line) => {
        const game = data.games.find((g) => g.boardNo === line.boardNo);
        const score = game?.scoreText?.split("-") ?? ["", ""];
        return {
          boardNo: line.boardNo,
          winnerSide: (game?.winnerSide ?? "") as "" | "team1" | "team2",
          leftGames: score[0] ?? "",
          rightGames: score[1] ?? "",
        };
      });

      const nextOrderSelections: Record<number, OrderSelectionValue> = {};
      defs.forEach((def) => {
        nextOrderSelections[def.boardNo] = { first: "", second: "" };
      });

      setEditableGames(nextEditableGames);
      setOrderSelections(nextOrderSelections);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "試合情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function closeMatch() {
    setSelectedMatchId(null);
    setModalData(null);
    setMessage("");
    setOrderConfirmModalOpen(false);
    setResultConfirmModalOpen(false);
  }

  function getSelectableMembers() {
    if (!modalData) return [];
    const entryId = orderSide === "team1" ? modalData.team1EntryId : modalData.team2EntryId;
    const members = entryId ? memberMap.get(entryId) ?? [] : [];
    return [...members, "BYE"];
  }

  function updateOrderSelection(
    boardNo: number,
    key: "first" | "second",
    value: string
  ) {
    setOrderSelections((prev) => ({
      ...prev,
      [boardNo]: {
        first: prev[boardNo]?.first ?? "",
        second: prev[boardNo]?.second ?? "",
        [key]: value,
      },
    }));
  }

  function updateGame(boardNo: number, patch: Partial<EditableGameRow>) {
    setEditableGames((prev) =>
      prev.map((row) => (row.boardNo === boardNo ? { ...row, ...patch } : row))
    );
  }

  function openOrderConfirmModal() {
    if (!modalData) return;

    const invalid = boardDefinitions.some((def) => {
      const value = orderSelections[def.boardNo] ?? { first: "", second: "" };
      if (def.matchType === "W") {
        return !value.first || !value.second;
      }
      return !value.first;
    });

    if (invalid) {
      setMessage("最低限必要な番手を入力してください。ダブルスは2名選択してください。");
      return;
    }

    setMessage("");
    setOrderConfirmModalOpen(true);
  }

  async function submitOrder() {
    if (!modalData || !selectedMatchId) return;

    const payload = boardDefinitions.map((def) => {
      const value = orderSelections[def.boardNo] ?? { first: "", second: "" };
      return {
        boardNo: def.boardNo,
        playerName: buildOrderText(def.matchType, value),
      };
    });

    startTransition(async () => {
      try {
        const res = await fetch("/api/public-team-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tournamentId,
            divisionId,
            matchId: selectedMatchId,
            side: orderSide,
            orderLines: payload,
          }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "オーダー提出に失敗しました。");

        setMessage("オーダーを送信しました。");
        setOrderConfirmModalOpen(false);
        await openMatch(selectedMatchId);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "オーダー提出に失敗しました。");
      }
    });
  }

  async function submitResult() {
    if (!modalData || !selectedMatchId) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/public-team-match-result", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tournamentId,
            divisionId,
            matchId: selectedMatchId,
            results: editableGames,
            finalize: true,
          }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "結果送信に失敗しました。");

        setMessage("試合結果を確定して送信しました。");
        setResultConfirmModalOpen(false);
        await openMatch(selectedMatchId);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "結果送信に失敗しました。");
      }
    });
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1500px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "8px" }}>進行確認・結果入力</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {divisionName}
      </p>

      <div style={{ display: "grid", gap: "20px" }}>
        {leagueBoards.map((board) => (
          <LeagueBoardSection key={board.groupNo} board={board} onOpenMatch={openMatch} />
        ))}

        {groupedBrackets.map((bracket) => (
          <PublicBracketSection
            key={bracket.bracketLabel}
            bracketLabel={bracket.bracketLabel}
            rounds={bracket.rounds}
            onOpenMatch={openMatch}
          />
        ))}
      </div>

      {selectedMatchId && (
        <div
          onClick={closeMatch}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1000px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: "12px",
              padding: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ margin: 0 }}>団体戦 試合入力</h2>
              <button type="button" onClick={closeMatch} style={smallButtonStyle}>
                閉じる
              </button>
            </div>

            {loading ? (
              <p>読み込み中...</p>
            ) : modalData ? (
              <div style={{ display: "grid", gap: "18px" }}>
                <section style={cardStyle}>
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                    {modalData.team1Name} vs {modalData.team2Name}
                  </div>
                  <div style={{ color: "#666", fontSize: "14px" }}>
                    団体戦形式: {modalData.teamMatchFormat ?? "-"}
                  </div>
                  <div style={{ color: "#666", fontSize: "14px", marginTop: "6px" }}>
                    コートは閲覧のみです。設定はできません。
                  </div>
                </section>

                <section style={cardStyle}>
                  <div style={{ fontWeight: 700, marginBottom: "12px" }}>オーダー提出（団体戦）</div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        checked={orderSide === "team1"}
                        onChange={() => setOrderSide("team1")}
                      />
                      {modalData.team1Name}
                    </label>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        checked={orderSide === "team2"}
                        onChange={() => setOrderSide("team2")}
                      />
                      {modalData.team2Name}
                    </label>
                  </div>

                  <div style={{ color: "#666", fontSize: "14px", marginBottom: "10px" }}>
                    候補選手:{" "}
                    {getSelectableMembers().filter((v) => v !== "BYE").length > 0
                      ? getSelectableMembers().filter((v) => v !== "BYE").join(", ")
                      : "登録選手がありません。受付ページで選手登録してください。"}
                  </div>

                  <div style={{ display: "grid", gap: "14px" }}>
                    {boardDefinitions.map((def) => {
                      const value = orderSelections[def.boardNo] ?? { first: "", second: "" };

                      return (
                        <div
                          key={def.boardNo}
                          style={{
                            display: "grid",
                            gap: "10px",
                            border: "1px solid #eee",
                            borderRadius: "8px",
                            padding: "12px",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {def.boardNo}番 ({def.matchType})
                          </div>

                          {def.matchType === "W" ? (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "10px",
                              }}
                            >
                              <select
                                value={value.first}
                                onChange={(e) =>
                                  updateOrderSelection(def.boardNo, "first", e.target.value)
                                }
                                style={inputStyle}
                              >
                                <option value="">1人目を選択</option>
                                {getSelectableMembers().map((member) => (
                                  <option key={`${def.boardNo}-first-${member}`} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={value.second}
                                onChange={(e) =>
                                  updateOrderSelection(def.boardNo, "second", e.target.value)
                                }
                                style={inputStyle}
                              >
                                <option value="">2人目を選択</option>
                                {getSelectableMembers().map((member) => (
                                  <option key={`${def.boardNo}-second-${member}`} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <select
                              value={value.first}
                              onChange={(e) =>
                                updateOrderSelection(def.boardNo, "first", e.target.value)
                              }
                              style={inputStyle}
                            >
                              <option value="">選択してください</option>
                              {getSelectableMembers().map((member) => (
                                <option key={`${def.boardNo}-single-${member}`} value={member}>
                                  {member}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <button type="button" onClick={openOrderConfirmModal} style={primaryButtonStyle}>
                      このオーダーで提出します
                    </button>
                  </div>
                </section>

                <section style={cardStyle}>
                  <div style={{ fontWeight: 700, marginBottom: "12px" }}>試合結果入力（団体戦）</div>

                  <div style={{ display: "grid", gap: "12px" }}>
                    {boardDefinitions.map((def) => {
                      const row = editableGames.find((g) => g.boardNo === def.boardNo);
                      return (
                        <div
                          key={def.boardNo}
                          style={{
                            border: "1px solid #eee",
                            borderRadius: "8px",
                            padding: "12px",
                            display: "grid",
                            gap: "10px",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {def.boardNo}番 ({def.matchType})
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1.2fr 1fr 1fr",
                              gap: "10px",
                            }}
                          >
                            <select
                              value={row?.winnerSide ?? ""}
                              onChange={(e) =>
                                updateGame(def.boardNo, {
                                  winnerSide: e.target.value as "" | "team1" | "team2",
                                })
                              }
                              style={inputStyle}
                            >
                              <option value="">勝者を選択</option>
                              <option value="team1">{modalData.team1Name}</option>
                              <option value="team2">{modalData.team2Name}</option>
                            </select>

                            <input
                              value={row?.leftGames ?? ""}
                              onChange={(e) =>
                                updateGame(def.boardNo, { leftGames: e.target.value })
                              }
                              type="number"
                              min={0}
                              placeholder="左ゲーム数"
                              style={inputStyle}
                            />

                            <input
                              value={row?.rightGames ?? ""}
                              onChange={(e) =>
                                updateGame(def.boardNo, { rightGames: e.target.value })
                              }
                              type="number"
                              min={0}
                              placeholder="右ゲーム数"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <button
                      type="button"
                      onClick={() => setResultConfirmModalOpen(true)}
                      style={primaryButtonStyle}
                    >
                      団体戦の勝敗が決まったので、試合結果を確定して送信する
                    </button>
                  </div>
                </section>

                {message ? (
                  <div
                    style={{
                      padding: "12px",
                      border: "1px solid #eee",
                      borderRadius: "8px",
                      background: "#fafafa",
                    }}
                  >
                    {message}
                  </div>
                ) : null}
              </div>
            ) : (
              <p>データを読み込めませんでした。</p>
            )}
          </div>
        </div>
      )}

      {orderConfirmModalOpen && modalData && (
        <ConfirmModal
          title="オーダー提出の確認"
          description="提出後は変更できません。本当にこの内容で送信して大丈夫ですか？"
          onClose={() => setOrderConfirmModalOpen(false)}
          onConfirm={submitOrder}
          isPending={isPending}
        >
          <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
            <div style={{ fontWeight: 700 }}>
              提出対象: {orderSide === "team1" ? modalData.team1Name : modalData.team2Name}
            </div>
            {boardDefinitions.map((def) => {
              const value = orderSelections[def.boardNo] ?? { first: "", second: "" };
              const label =
                def.matchType === "W"
                  ? `${value.first || "未選択"} / ${value.second || "未選択"}`
                  : value.first || "未選択";

              return (
                <div key={def.boardNo}>
                  {def.boardNo}番 ({def.matchType}) : {label}
                </div>
              );
            })}
          </div>
        </ConfirmModal>
      )}

      {resultConfirmModalOpen && (
        <ConfirmModal
          title="結果送信の確認"
          description="送信すると変更できませんが、本当に大丈夫ですか？"
          onClose={() => setResultConfirmModalOpen(false)}
          onConfirm={submitResult}
          isPending={isPending}
        />
      )}
    </main>
  );
}

function ConfirmModal({
  title,
  description,
  onClose,
  onConfirm,
  isPending,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 1100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          display: "grid",
          gap: "14px",
        }}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ color: "#555", lineHeight: 1.6 }}>{description}</div>
        {children}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            戻る
          </button>
          <button type="button" disabled={isPending} onClick={onConfirm} style={primaryButtonStyle}>
            送信する
          </button>
        </div>
      </div>
    </div>
  );
}

function PublicBracketSection({
  bracketLabel,
  rounds,
  onOpenMatch,
}: {
  bracketLabel: string;
  rounds: Array<{
    roundNo: number;
    matches: KnockoutMatch[];
  }>;
  onOpenMatch: (matchId: string) => void;
}) {
  const columnHeights = rounds.map((_, roundIndex) => {
    const topOffset = getRoundTopOffset(roundIndex);
    const gap = getRoundGap(roundIndex);
    const count = rounds[roundIndex].matches.length;
    if (count === 0) return topOffset + BRACKET_CARD_HEIGHT;
    return topOffset + count * BRACKET_CARD_HEIGHT + (count - 1) * gap;
  });

  const maxHeight = Math.max(...columnHeights, BRACKET_CARD_HEIGHT + 20);

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: "10px",
        background: "white",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee", fontWeight: 700 }}>
        {bracketLabel}
      </div>

      <div style={{ overflowX: "auto", padding: "20px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: `${BRACKET_COLUMN_GAP}px`,
            minWidth: `${Math.max(1, rounds.length) * (BRACKET_CARD_WIDTH + BRACKET_COLUMN_GAP)}px`,
          }}
        >
          {rounds.map((round, roundIndex) => (
            <BracketRoundColumn
              key={`${bracketLabel}-${round.roundNo}`}
              roundNo={round.roundNo}
              matches={round.matches}
              roundIndex={roundIndex}
              columnHeight={maxHeight}
              onOpenMatch={onOpenMatch}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BracketRoundColumn({
  roundNo,
  matches,
  roundIndex,
  columnHeight,
  onOpenMatch,
}: {
  roundNo: number;
  matches: KnockoutMatch[];
  roundIndex: number;
  columnHeight: number;
  onOpenMatch: (matchId: string) => void;
}) {
  const topOffset = getRoundTopOffset(roundIndex);
  const gap = getRoundGap(roundIndex);

  return (
    <div style={{ position: "relative", width: `${BRACKET_CARD_WIDTH}px`, height: `${columnHeight}px` }}>
      <div style={{ fontWeight: 700, marginBottom: "14px" }}>{roundNo}回戦</div>

      <div
        style={{
          position: "relative",
          marginTop: "8px",
          height: `${columnHeight - 30}px`,
        }}
      >
        {matches.map((match, matchIndex) => {
          const top = topOffset + matchIndex * (BRACKET_CARD_HEIGHT + gap);

          return (
            <div
              key={match.matchId}
              style={{
                position: "absolute",
                top: `${top}px`,
                left: 0,
              }}
            >
              <BracketMatchCard
                match={match}
                roundIndex={roundIndex}
                matchIndex={matchIndex}
                totalMatches={matches.length}
                onOpenMatch={onOpenMatch}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  roundIndex,
  matchIndex,
  totalMatches,
  onOpenMatch,
}: {
  match: KnockoutMatch;
  roundIndex: number;
  matchIndex: number;
  totalMatches: number;
  onOpenMatch: (matchId: string) => void;
}) {
  const connectorSpan = (BRACKET_CARD_HEIGHT + BRACKET_BASE_GAP) * 2 ** roundIndex;
  const halfSpan = connectorSpan / 2;
  const pairTop = matchIndex % 2 === 0;
  const hasPair = pairTop ? matchIndex + 1 < totalMatches : true;

  return (
    <div style={{ position: "relative", width: `${BRACKET_CARD_WIDTH}px`, height: `${BRACKET_CARD_HEIGHT}px` }}>
      {hasPair ? (
        <>
          <div
            style={{
              position: "absolute",
              right: `-${BRACKET_COLUMN_GAP / 2}px`,
              top: "50%",
              width: `${BRACKET_COLUMN_GAP / 2}px`,
              borderTop: "2px solid #444",
              transform: "translateY(-50%)",
            }}
          />

          {pairTop ? (
            <div
              style={{
                position: "absolute",
                right: `-${BRACKET_COLUMN_GAP / 2}px`,
                top: "50%",
                width: `${BRACKET_COLUMN_GAP / 2}px`,
                height: `${halfSpan}px`,
                borderRight: "2px solid #444",
                borderBottom: "2px solid #444",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                right: `-${BRACKET_COLUMN_GAP / 2}px`,
                top: `calc(50% - ${halfSpan}px)`,
                width: `${BRACKET_COLUMN_GAP / 2}px`,
                height: `${halfSpan}px`,
                borderRight: "2px solid #444",
                borderTop: "2px solid #444",
              }}
            />
          )}
        </>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenMatch(match.matchId)}
        style={{
          width: `${BRACKET_CARD_WIDTH}px`,
          height: `${BRACKET_CARD_HEIGHT}px`,
          border: "1px solid #444",
          borderRadius: "10px",
          background: "white",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            padding: "10px 12px",
            borderBottom: "1px solid #ddd",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          <span>第{match.matchNo}試合</span>
          <span>
            {match.assignedCourts.length > 0
              ? match.assignedCourts.map((n) => `${n}コート`).join(", ")
              : "コート未設定"}
          </span>
        </div>

        <div
          style={{
            minHeight: "42px",
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            lineHeight: 1.25,
            display: "flex",
            alignItems: "center",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {match.team1Name}
        </div>

        <div
          style={{
            minHeight: "42px",
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            lineHeight: 1.25,
            display: "flex",
            alignItems: "center",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {match.team2Name}
        </div>

        <div
          style={{
            minHeight: "36px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#555",
            display: "flex",
            alignItems: "center",
          }}
        >
          {getStatusText(match.status, match.scoreText)}
        </div>
      </button>
    </div>
  );
}

function LeagueBoardSection({
  board,
  onOpenMatch,
}: {
  board: LeagueBoard;
  onOpenMatch: (matchId: string) => void;
}) {
  const cellMap = new Map<string, CellRow>();
  for (const cell of board.cells) {
    cellMap.set(`${cell.rowEntryId}-${cell.colEntryId}`, cell);
  }

  const standingMap = new Map<string, StandingRow>();
  for (const row of board.standings) {
    standingMap.set(row.entryId, row);
  }

  return (
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
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>第{board.groupNo}リーグ</div>
        <div style={{ fontSize: "13px", color: "#555" }}>
          コート:{" "}
          {board.assignedCourts.length > 0
            ? board.assignedCourts.map((n) => `${n}コート`).join(", ")
            : "未設定"}
        </div>
      </div>

      <div style={{ overflowX: "auto", padding: "16px" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "1100px", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={headCellStyle(180, "left")}>チーム名</th>
              {board.teams.map((team, idx) => (
                <th key={team.entryId} style={headCellStyle(110, "center")}>
                  <div>{idx + 1}</div>
                  <div style={{ marginTop: "4px", fontSize: "12px" }}>{team.teamName}</div>
                </th>
              ))}
              <th style={headCellStyle(52, "center")}>試</th>
              <th style={headCellStyle(52, "center")}>勝</th>
              <th style={headCellStyle(52, "center")}>敗</th>
              <th style={headCellStyle(52, "center")}>得</th>
              <th style={headCellStyle(52, "center")}>失</th>
              <th style={headCellStyle(52, "center")}>差</th>
              <th style={headCellStyle(52, "center")}>順</th>
            </tr>
          </thead>
          <tbody>
            {board.teams.map((rowTeam) => {
              const standing = standingMap.get(rowTeam.entryId);
              return (
                <tr key={rowTeam.entryId}>
                  <td style={bodyCellStyle("left")}>{rowTeam.teamName}</td>

                  {board.teams.map((colTeam) => {
                    if (rowTeam.entryId === colTeam.entryId) {
                      return (
                        <td
                          key={`${rowTeam.entryId}-${colTeam.entryId}`}
                          style={{
                            border: "1px solid #ccc",
                            background: "#f6f6f6",
                            textAlign: "center",
                            padding: "10px",
                          }}
                        >
                          ―
                        </td>
                      );
                    }

                    const cell =
                      cellMap.get(`${rowTeam.entryId}-${colTeam.entryId}`) ??
                      cellMap.get(`${colTeam.entryId}-${rowTeam.entryId}`);

                    return (
                      <td
                        key={`${rowTeam.entryId}-${colTeam.entryId}`}
                        style={{
                          border: "1px solid #ccc",
                          textAlign: "center",
                          padding: "6px",
                        }}
                      >
                        {cell ? (
                          <button
                            type="button"
                            onClick={() => onOpenMatch(cell.matchId)}
                            style={{
                              width: "100%",
                              minHeight: "52px",
                              border: "1px solid #ccc",
                              borderRadius: "6px",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                              display: "grid",
                              gap: "4px",
                              alignContent: "center",
                            }}
                          >
                            {cell.status !== "completed" && (
                              <span style={{ color: "#d11", fontSize: "11px", fontWeight: 700 }}>
                                試合順 {cell.roundNo ?? "-"}
                              </span>
                            )}
                            <span>{cell.scoreText ?? (cell.status === "completed" ? "完了" : "未入力")}</span>
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}

                  <td style={bodyCellStyle("center")}>{standing?.played ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.wins ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.losses ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.teamPointsFor ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.teamPointsAgainst ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.teamPointDiff ?? 0}</td>
                  <td style={bodyCellStyle("center")}>{standing?.rank ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "14px",
  background: "white",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

const radioLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

function headCellStyle(width: number, align: "left" | "center"): React.CSSProperties {
  return {
    border: "1px solid #ccc",
    padding: "8px 6px",
    background: "#fafafa",
    minWidth: `${width}px`,
    fontWeight: 700,
    textAlign: align,
  };
}

function bodyCellStyle(align: "left" | "center"): React.CSSProperties {
  return {
    border: "1px solid #ccc",
    padding: "8px 6px",
    textAlign: align,
    verticalAlign: "middle",
    background: "white",
  };
}
"use client";

import { useMemo, useState } from "react";

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

type StandingRow = {
  rank: number;
  entryId: string;
  teamName: string;
  teamAffiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  teamPointsFor: number;
  teamPointsAgainst: number;
  teamPointDiff: number;
};

type LeagueBoardData = {
  groupNo: number;
  assignedCourts: number[];
  teams: TeamRow[];
  cells: CellRow[];
  standings: StandingRow[];
};

type Props = {
  tournamentId: string;
  divisionId: string;
  boards: LeagueBoardData[];
};

type SwapTarget = {
  groupNo: number;
  entryId: string;
} | null;

function getCellLabel(status: string | null | undefined, scoreText: string | null | undefined) {
  if (status === "completed") return scoreText ?? "完了";
  if (status === "in_progress") return "試合中";
  if (status === "pending") return "未入力";
  return scoreText ?? "-";
}

function getCellBg(status: string | null | undefined) {
  if (status === "completed") return "#f3f3f3";
  if (status === "in_progress") return "#eef5ff";
  return "white";
}

function parseScoreText(scoreText: string | null | undefined) {
  if (!scoreText || !scoreText.includes("-")) {
    return { left: "", right: "" };
  }
  const [left, right] = String(scoreText).split("-");
  return { left, right };
}

function LeagueBoardTable({
  groupNo,
  assignedCourts,
  teams,
  cells,
  standings,
  onOpenMatch,
}: {
  groupNo: number;
  assignedCourts: number[];
  teams: TeamRow[];
  cells: CellRow[];
  standings: StandingRow[];
  onOpenMatch: (matchId: string) => void;
}) {
  const cellMap = useMemo(() => {
    const map = new Map<string, CellRow>();
    for (const cell of cells ?? []) {
      map.set(`${cell.rowEntryId}-${cell.colEntryId}`, cell);
    }
    return map;
  }, [cells]);

  const standingMap = useMemo(() => {
    const map = new Map<string, StandingRow>();
    for (const row of standings ?? []) {
      map.set(row.entryId, row);
    }
    return map;
  }, [standings]);

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
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700 }}>第{groupNo}リーグ</div>
        <div style={{ fontSize: "13px", color: "#555" }}>
          使用コート:{" "}
          {assignedCourts.length > 0
            ? assignedCourts.map((n) => `${n}コート`).join(", ")
            : "未設定"}
        </div>
      </div>

      <div style={{ overflowX: "auto", padding: "16px" }}>
        <table
          style={{
            borderCollapse: "collapse",
            minWidth: `${Math.max(1040, 280 + teams.length * 110)}px`,
            background: "white",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr>
              <th style={headCellStyle(180, "left")}>チーム名</th>

              {teams.map((team, index) => (
                <th key={team.entryId} style={headCellStyle(110, "center")}>
                  <div style={{ fontWeight: 700 }}>{index + 1}</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>{team.teamName}</div>
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
            {teams.map((rowTeam) => {
              const standing = standingMap.get(rowTeam.entryId);

              return (
                <tr key={rowTeam.entryId}>
                  <td style={bodyCellStyle("left")}>{rowTeam.teamName}</td>

                  {teams.map((colTeam) => {
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
                          padding: "6px",
                          background: getCellBg(cell?.status),
                          textAlign: "center",
                          verticalAlign: "middle",
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
                              padding: "6px",
                              display: "grid",
                              gap: "4px",
                              alignContent: "center",
                            }}
                          >
                            {cell.status !== "completed" && (
                              <span
                                style={{
                                  color: "#d11",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                }}
                              >
                                試合順 {cell.roundNo ?? "-"}
                              </span>
                            )}

                            <span>{getCellLabel(cell.status, cell.scoreText)}</span>
                          </button>
                        ) : (
                          <span style={{ color: "#999" }}>-</span>
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

function LeagueBoardEditTable({
  groupNo,
  assignedCourts,
  entryIds,
  entryNameMap,
  selectedSwap,
  onPickSwap,
  onMove,
}: {
  groupNo: number;
  assignedCourts: number[];
  entryIds: string[];
  entryNameMap: Map<string, string>;
  selectedSwap: SwapTarget;
  onPickSwap: (groupNo: number, entryId: string) => void;
  onMove: (groupNo: number, index: number, direction: -1 | 1) => void;
}) {
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
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700 }}>第{groupNo}リーグ（編集モード）</div>
        <div style={{ fontSize: "13px", color: "#555" }}>
          使用コート:{" "}
          {assignedCourts.length > 0
            ? assignedCourts.map((n) => `${n}コート`).join(", ")
            : "未設定"}
        </div>
      </div>

      <div style={{ padding: "16px", display: "grid", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>
          「入れ替え」を押したチーム同士を交換します。↑↓で同一リーグ内の順番も変更できます。
        </div>

        {entryIds.map((entryId, index) => {
          const isSelected =
            selectedSwap?.groupNo === groupNo && selectedSwap?.entryId === entryId;

          return (
            <div
              key={`${groupNo}-${entryId}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                border: isSelected ? "2px solid #2563eb" : "1px solid #ccc",
                borderRadius: "8px",
                padding: "10px 12px",
                background: isSelected ? "#eff6ff" : "white",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {index + 1}. {entryNameMap.get(entryId) ?? "-"}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onMove(groupNo, index, -1)}
                  disabled={index === 0}
                  style={smallButtonStyle}
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={() => onMove(groupNo, index, 1)}
                  disabled={index === entryIds.length - 1}
                  style={smallButtonStyle}
                >
                  ↓
                </button>

                <button
                  type="button"
                  onClick={() => onPickSwap(groupNo, entryId)}
                  style={{
                    ...smallButtonStyle,
                    borderColor: isSelected ? "#2563eb" : "#ccc",
                    background: isSelected ? "#eff6ff" : "white",
                  }}
                >
                  {isSelected ? "選択中" : "入れ替え"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function TeamLeagueBoardClient({
  tournamentId,
  divisionId,
  boards,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<MatchModalData | null>(null);
  const [editableGames, setEditableGames] = useState<EditableGameRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingGroups, setIsSavingGroups] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<SwapTarget>(null);

  const initialEditableGroups = useMemo(() => {
    const initial: Record<number, string[]> = {};
    for (const board of boards) {
      initial[board.groupNo] = board.teams.map((team) => team.entryId);
    }
    return initial;
  }, [boards]);

  const [editableGroups, setEditableGroups] =
    useState<Record<number, string[]>>(initialEditableGroups);

  const entryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const board of boards) {
      for (const team of board.teams) {
        map.set(team.entryId, team.teamName);
      }
    }
    return map;
  }, [boards]);

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

  function resetEditableGroups() {
    setEditableGroups(initialEditableGroups);
    setSelectedSwap(null);
  }

  function moveEntryWithinGroup(groupNo: number, index: number, direction: -1 | 1) {
    setEditableGroups((prev) => {
      const current = [...(prev[groupNo] ?? [])];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return prev;
      }

      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];

      return {
        ...prev,
        [groupNo]: current,
      };
    });
  }

  function swapEntries(a: { groupNo: number; entryId: string }, b: { groupNo: number; entryId: string }) {
    setEditableGroups((prev) => {
      const next: Record<number, string[]> = {};
      for (const key of Object.keys(prev)) {
        next[Number(key)] = [...prev[Number(key)]];
      }

      const aIndex = next[a.groupNo].indexOf(a.entryId);
      const bIndex = next[b.groupNo].indexOf(b.entryId);

      if (aIndex === -1 || bIndex === -1) {
        return prev;
      }

      next[a.groupNo][aIndex] = b.entryId;
      next[b.groupNo][bIndex] = a.entryId;

      return next;
    });
  }

  function handlePickSwap(groupNo: number, entryId: string) {
    if (!selectedSwap) {
      setSelectedSwap({ groupNo, entryId });
      return;
    }

    if (selectedSwap.groupNo === groupNo && selectedSwap.entryId === entryId) {
      setSelectedSwap(null);
      return;
    }

    swapEntries(selectedSwap, { groupNo, entryId });
    setSelectedSwap(null);
  }

  async function saveGroupEdit() {
    setIsSavingGroups(true);

    try {
      const res = await fetch("/api/team-leagues/update-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId,
          divisionId,
          editedGroups: boards.map((board) => ({
            groupNo: board.groupNo,
            entryIds: editableGroups[board.groupNo] ?? [],
          })),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "リーグ編集保存に失敗しました。");
      }

      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "リーグ編集保存に失敗しました。");
    } finally {
      setIsSavingGroups(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {!isEditMode ? (
          <button type="button" onClick={() => setIsEditMode(true)} style={topButtonStyle}>
            リーグ編集モードにする
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={saveGroupEdit}
              disabled={isSavingGroups}
              style={topButtonStyle}
            >
              {isSavingGroups ? "保存中..." : "編集内容を保存する"}
            </button>

            <button
              type="button"
              onClick={() => {
                resetEditableGroups();
                setIsEditMode(false);
              }}
              disabled={isSavingGroups}
              style={topButtonStyle}
            >
              キャンセル
            </button>
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {boards.map((board) =>
          isEditMode ? (
            <LeagueBoardEditTable
              key={board.groupNo}
              groupNo={board.groupNo}
              assignedCourts={board.assignedCourts}
              entryIds={editableGroups[board.groupNo] ?? []}
              entryNameMap={entryNameMap}
              selectedSwap={selectedSwap}
              onPickSwap={handlePickSwap}
              onMove={moveEntryWithinGroup}
            />
          ) : (
            <LeagueBoardTable
              key={board.groupNo}
              groupNo={board.groupNo}
              assignedCourts={board.assignedCourts}
              teams={board.teams}
              cells={board.cells}
              standings={board.standings}
              onOpenMatch={openMatchModal}
            />
          )
        )}
      </div>

      {modalOpen && !isEditMode && (
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
              <h2 style={{ margin: 0, fontSize: "20px" }}>団体戦 試合管理</h2>
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
                    団体スコア: {modalData.teamScoreText ?? "-"} / 状態:{" "}
                    {modalData.matchStatus ?? "-"}
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
                      {modalData.team1Name}:{" "}
                      {modalData.team1OrderSubmitted ? "提出済" : "未提出"}
                    </div>
                    <div>
                      {modalData.team2Name}:{" "}
                      {modalData.team2OrderSubmitted ? "提出済" : "未提出"}
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
                                  updateGameRow(row.boardNo, { leftGames: e.target.value })
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
                                  updateGameRow(row.boardNo, { rightGames: e.target.value })
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

const topButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

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
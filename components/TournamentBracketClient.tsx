"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildBracketPages } from "@/lib/brackets/paginate";
import BracketSvg from "@/components/BracketSvg";

type BracketMatch = {
  id: string;
  bracket_id: string;
  round_no: number;
  match_no: number;
  status: string | null;
  table_no: string | null;
  score_text: string | null;
  game_scores: Array<{ p1: number | null; p2: number | null }> | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  next_match_id?: string | null;
  next_slot?: number | null;
  source_group_id_1?: string | null;
  source_rank_1?: number | null;
  source_group_id_2?: string | null;
  source_rank_2?: number | null;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  bracketType: string;
  title: string;
  matches: BracketMatch[];
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
};

type GameInputRow = {
  p1: string;
  p2: string;
};

function buildSourceKey(groupId?: string | null, rank?: number | null) {
  if (!groupId || !rank) return "";
  return `${groupId}:${rank}`;
}

function getDisplayName(params: {
  entryId: string | null;
  otherEntryId: string | null;
  sourceGroupId?: string | null;
  sourceRank?: number | null;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
}) {
  const {
    entryId,
    otherEntryId,
    sourceGroupId,
    sourceRank,
    entryLabelMap,
    placeholderLabelMap,
  } = params;

  if (entryId) return entryLabelMap[entryId] ?? "-";

  const sourceKey = buildSourceKey(sourceGroupId, sourceRank);
  if (sourceKey && placeholderLabelMap?.[sourceKey]) {
    return placeholderLabelMap[sourceKey];
  }

  if (otherEntryId) return "BYE";
  return "未定";
}

function parseGameScores(
  input: Array<{ p1: string; p2: string }>
): Array<{ p1: number | null; p2: number | null }> {
  return input.map((row) => {
    const p1 = row.p1 === "" ? null : Number(row.p1);
    const p2 = row.p2 === "" ? null : Number(row.p2);

    return {
      p1: Number.isFinite(p1) ? p1 : null,
      p2: Number.isFinite(p2) ? p2 : null,
    };
  });
}

function countGamesWon(
  scores: Array<{ p1: number | null; p2: number | null }>
) {
  let p1Wins = 0;
  let p2Wins = 0;

  for (const row of scores) {
    if (row.p1 === null || row.p2 === null) continue;
    if (row.p1 > row.p2) p1Wins += 1;
    if (row.p2 > row.p1) p2Wins += 1;
  }

  return { p1Wins, p2Wins };
}

export default function TournamentBracketClient({
  tournamentId,
  divisionId,
  bracketType,
  title,
  matches,
  entryLabelMap,
  placeholderLabelMap,
}: Props) {
  const router = useRouter();

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [tableNo, setTableNo] = useState("");
  const [winnerEntryId, setWinnerEntryId] = useState("");
  const [gameInputs, setGameInputs] = useState<GameInputRow[]>(
    Array.from({ length: 7 }, () => ({ p1: "", p2: "" }))
  );
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  const pages = useMemo(() => buildBracketPages(matches, 16, 2), [matches]);

  const selectedPlayers = useMemo(() => {
    if (!selectedMatch) return null;

    const p1Label = getDisplayName({
      entryId: selectedMatch.player1_entry_id,
      otherEntryId: selectedMatch.player2_entry_id,
      sourceGroupId: selectedMatch.source_group_id_1,
      sourceRank: selectedMatch.source_rank_1,
      entryLabelMap,
      placeholderLabelMap,
    });

    const p2Label = getDisplayName({
      entryId: selectedMatch.player2_entry_id,
      otherEntryId: selectedMatch.player1_entry_id,
      sourceGroupId: selectedMatch.source_group_id_2,
      sourceRank: selectedMatch.source_rank_2,
      entryLabelMap,
      placeholderLabelMap,
    });

    return { p1Label, p2Label };
  }, [selectedMatch, entryLabelMap, placeholderLabelMap]);

  const parsedScores = useMemo(() => parseGameScores(gameInputs), [gameInputs]);
  const gameWins = useMemo(() => countGamesWon(parsedScores), [parsedScores]);

  function openMatch(match: BracketMatch) {
    setSelectedMatchId(match.id);
    setErrorMessage("");
    setTableNo(match.table_no ?? "");

    const currentScores = Array.isArray(match.game_scores) ? match.game_scores : [];
    const nextInputs = Array.from({ length: 7 }, (_, i) => ({
      p1:
        currentScores[i]?.p1 === null || currentScores[i]?.p1 === undefined
          ? ""
          : String(currentScores[i].p1),
      p2:
        currentScores[i]?.p2 === null || currentScores[i]?.p2 === undefined
          ? ""
          : String(currentScores[i].p2),
    }));
    setGameInputs(nextInputs);

    setWinnerEntryId(match.winner_entry_id ?? "");
  }

  function closeModal() {
    setSelectedMatchId(null);
    setErrorMessage("");
    setTableNo("");
    setWinnerEntryId("");
    setGameInputs(Array.from({ length: 7 }, () => ({ p1: "", p2: "" })));
  }

  async function submitAction(
    action: "start" | "complete" | "forfeit",
    forcedWinnerId?: string
  ) {
    if (!selectedMatch) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("tournamentId", tournamentId);
      formData.append("divisionId", divisionId);
      formData.append("bracketType", bracketType);
      formData.append("matchId", selectedMatch.id);
      formData.append("action", action);
      formData.append("tableNo", tableNo);

      if (action === "start") {
        if (!selectedMatch.player1_entry_id || !selectedMatch.player2_entry_id) {
          throw new Error("対戦相手が未確定のため開始できません。");
        }
        if (!tableNo.trim()) {
          throw new Error("台番号を入力してください。");
        }
      }

      if (action === "complete") {
        if (!selectedMatch.player1_entry_id || !selectedMatch.player2_entry_id) {
          throw new Error("対戦相手が未確定のため結果確定できません。");
        }

        const targetWinner = forcedWinnerId || winnerEntryId;
        if (!targetWinner) {
          throw new Error("勝者を選択してください。");
        }

        if (gameWins.p1Wins === 0 && gameWins.p2Wins === 0) {
          throw new Error("各ゲームのスコアを入力してください。");
        }

        if (gameWins.p1Wins === gameWins.p2Wins) {
          throw new Error("最終ゲーム数が同点です。");
        }

        const expectedWinner =
          gameWins.p1Wins > gameWins.p2Wins
            ? selectedMatch.player1_entry_id
            : selectedMatch.player2_entry_id;

        if (targetWinner !== expectedWinner) {
          throw new Error("勝者選択とゲーム数が一致していません。");
        }

        formData.append("winnerEntryId", targetWinner);
        formData.append("scoreText", `${gameWins.p1Wins}-${gameWins.p2Wins}`);
        formData.append("gameScores", JSON.stringify(parsedScores));
      }

      if (action === "forfeit") {
        const targetWinner = forcedWinnerId || winnerEntryId;
        if (!targetWinner) {
          throw new Error("棄権時の勝者を選択してください。");
        }
        formData.append("winnerEntryId", targetWinner);
      }

      const res = await fetch("/api/matches/update-progress", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "更新に失敗しました。");
      }

      closeModal();
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: "grid", gap: "20px" }}>
        {pages.length === 0 ? (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "16px",
              background: "white",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>
              {title}
            </div>
            <p>まだトーナメントはありません。</p>
          </div>
        ) : (
          pages.map((page) => (
            <div key={page.pageNo} style={{ display: "grid", gap: "16px" }}>
              {pages.length > 1 && (
                <div style={{ fontSize: "13px", color: "#666" }}>
                  続き {page.pageNo}/{pages.length}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: page.segments.length === 2 ? "1fr 1fr" : "1fr",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                {page.segments.map((segment) => (
                  <div
                    key={`${page.pageNo}-${segment.segmentStart}`}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "10px",
                      background: "white",
                      padding: "10px",
                    }}
                  >
                    <BracketSvg
                      title={title}
                      segmentTitle={`${segment.segmentStart}〜${segment.segmentEnd}枠`}
                      matches={segment.matches}
                      baseRoundNo={segment.baseRoundNo}
                      segmentStart={segment.segmentStart}
                      entryLabelMap={entryLabelMap}
                      placeholderLabelMap={placeholderLabelMap}
                      onMatchClick={openMatch}
                      fit="responsive"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedMatch && selectedPlayers && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "24px",
            zIndex: 2000,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "760px",
              background: "white",
              borderRadius: "12px",
              border: "1px solid #ccc",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              padding: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <h2 style={{ marginTop: 0, marginBottom: "8px" }}>
                  試合番号 {selectedMatch.match_no}
                </h2>
                <p style={{ margin: 0 }}>
                  {selectedPlayers.p1Label} vs {selectedPlayers.p2Label}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div style={{ display: "grid", gap: "8px" }}>
                  <label>台番号</label>
                  <input
                    value={tableNo}
                    onChange={(e) => setTableNo(e.target.value)}
                    placeholder="例: 3"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      background: "white",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <label>勝者</label>
                  <select
                    value={winnerEntryId}
                    onChange={(e) => setWinnerEntryId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      background: "white",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">選択してください</option>
                    {selectedMatch.player1_entry_id && (
                      <option value={selectedMatch.player1_entry_id}>
                        {selectedPlayers.p1Label}
                      </option>
                    )}
                    {selectedMatch.player2_entry_id && (
                      <option value={selectedMatch.player2_entry_id}>
                        {selectedPlayers.p2Label}
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <label>各ゲームのスコア</label>
                <div style={{ display: "grid", gap: "8px" }}>
                  {gameInputs.map((row, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr 1fr",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <div>{index + 1}G</div>
                      <input
                        type="number"
                        min={0}
                        value={row.p1}
                        onChange={(e) => {
                          const next = [...gameInputs];
                          next[index] = { ...next[index], p1: e.target.value };
                          setGameInputs(next);
                        }}
                        placeholder={selectedPlayers.p1Label}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                          background: "white",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="number"
                        min={0}
                        value={row.p2}
                        onChange={(e) => {
                          const next = [...gameInputs];
                          next[index] = { ...next[index], p2: e.target.value };
                          setGameInputs(next);
                        }}
                        placeholder={selectedPlayers.p2Label}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                          background: "white",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: "14px" }}>
                最終ゲーム数: {gameWins.p1Wins} - {gameWins.p2Wins}
              </div>

              {errorMessage && (
                <p style={{ color: "crimson", margin: 0 }}>{errorMessage}</p>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <button
                  onClick={() => submitAction("start")}
                  disabled={saving}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  台番号を付与して試合開始
                </button>

                <button
                  onClick={() => submitAction("complete")}
                  disabled={saving}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  試合結果確定
                </button>

                {selectedMatch.player1_entry_id && (
                  <button
                    onClick={() =>
                      submitAction("forfeit", selectedMatch.player1_entry_id ?? "")
                    }
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    {selectedPlayers.p2Label} 棄権
                  </button>
                )}

                {selectedMatch.player2_entry_id && (
                  <button
                    onClick={() =>
                      submitAction("forfeit", selectedMatch.player2_entry_id ?? "")
                    }
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    {selectedPlayers.p1Label} 棄権
                  </button>
                )}

                <button
                  onClick={closeModal}
                  disabled={saving}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
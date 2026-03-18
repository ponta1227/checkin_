"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EntryRow = {
  id: string;
  players:
    | {
        id: string;
        name: string | null;
        affiliation: string | null;
      }
    | null;
};

type GroupRow = {
  id: string;
  group_no: number;
  name: string;
  table_numbers: string[] | null;
  results_confirmed?: boolean;
  results_confirmed_at?: string | null;
  rating_applied?: boolean;
};

type MemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type GameScoreRow = {
  p1: number | null;
  p2: number | null;
};

type MatchRow = {
  id: string;
  group_id: string;
  round_no: number;
  slot_no: number;
  match_no: number;
  table_no: string | null;
  player1_entry_id: string;
  player2_entry_id: string;
  referee_entry_id: string | null;
  winner_entry_id: string | null;
  score_text: string | null;
  game_scores?: GameScoreRow[] | null;
  status: string;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  tournamentName: string;
  divisionName: string;
  entries: EntryRow[];
  groups: GroupRow[];
  members: MemberRow[];
  matches: MatchRow[];
};

type StandingRow = {
  entry_id: string;
  slot_no: number;
  name: string;
  affiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
};

type GameInputRow = {
  p1: string;
  p2: string;
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function parseScore(scoreText: string | null) {
  if (!scoreText) return null;

  const nums = scoreText.match(/\d+/g);
  if (!nums || nums.length < 2) return null;

  const p1 = Number(nums[0]);
  const p2 = Number(nums[1]);

  if (Number.isNaN(p1) || Number.isNaN(p2)) return null;

  return { p1, p2 };
}

function toCircledNumber(n: number) {
  const table = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  return table[n - 1] ?? String(n);
}

function countGamesFromRows(rows: GameInputRow[]) {
  let p1Wins = 0;
  let p2Wins = 0;

  for (const row of rows) {
    if (row.p1 === "" || row.p2 === "") continue;
    const p1 = Number(row.p1);
    const p2 = Number(row.p2);
    if (Number.isNaN(p1) || Number.isNaN(p2)) continue;
    if (p1 > p2) p1Wins += 1;
    if (p2 > p1) p2Wins += 1;
  }

  return { p1Wins, p2Wins };
}

function calcRatio(won: number, lost: number) {
  if (lost === 0) {
    return won > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return won / lost;
}

function compareStandingsRows(a: StandingRow, b: StandingRow, directWinnerMap: Map<string, string>) {
  if (a.wins !== b.wins) return b.wins - a.wins;

  const direct = directWinnerMap.get(pairKey(a.entry_id, b.entry_id));
  if (direct === a.entry_id) return -1;
  if (direct === b.entry_id) return 1;

  if (a.gameDiff !== b.gameDiff) return b.gameDiff - a.gameDiff;
  if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;

  return a.slot_no - b.slot_no;
}

function buildStandings(params: {
  groupMembers: MemberRow[];
  groupMatches: MatchRow[];
  entryMap: Map<string, EntryRow>;
}) {
  const { groupMembers, groupMatches, entryMap } = params;

  const statsMap = new Map<string, StandingRow>();
  const directWinnerMap = new Map<string, string>();

  for (const member of groupMembers) {
    const entry = entryMap.get(member.entry_id);

    statsMap.set(member.entry_id, {
      entry_id: member.entry_id,
      slot_no: member.slot_no,
      name: entry?.players?.name ?? "-",
      affiliation: entry?.players?.affiliation ?? null,
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
    });
  }

  for (const match of groupMatches) {
    if (match.status !== "completed" || !match.winner_entry_id) continue;

    const p1 = statsMap.get(match.player1_entry_id);
    const p2 = statsMap.get(match.player2_entry_id);

    if (!p1 || !p2) continue;

    p1.played += 1;
    p2.played += 1;

    if (match.winner_entry_id === match.player1_entry_id) {
      p1.wins += 1;
      p2.losses += 1;
    } else if (match.winner_entry_id === match.player2_entry_id) {
      p2.wins += 1;
      p1.losses += 1;
    }

    directWinnerMap.set(
      pairKey(match.player1_entry_id, match.player2_entry_id),
      match.winner_entry_id
    );

    const parsed = parseScore(match.score_text);
    if (parsed) {
      p1.gamesWon += parsed.p1;
      p1.gamesLost += parsed.p2;
      p2.gamesWon += parsed.p2;
      p2.gamesLost += parsed.p1;
    }
  }

  const rows = [...statsMap.values()].map((row) => ({
    ...row,
    gameDiff: row.gamesWon - row.gamesLost,
  }));

  rows.sort((a, b) => compareStandingsRows(a, b, directWinnerMap));

  const groupedByWins = new Map<number, StandingRow[]>();
  for (const row of rows) {
    if (!groupedByWins.has(row.wins)) groupedByWins.set(row.wins, []);
    groupedByWins.get(row.wins)!.push(row);
  }

  const resolved: StandingRow[] = [];

  const winKeys = [...groupedByWins.keys()].sort((a, b) => b - a);

  for (const wins of winKeys) {
    const tiedRows = groupedByWins.get(wins)!;

    if (tiedRows.length <= 2) {
      tiedRows.sort((a, b) => compareStandingsRows(a, b, directWinnerMap));
      resolved.push(...tiedRows);
      continue;
    }

    const tiedIds = new Set(tiedRows.map((r) => r.entry_id));
    const miniStats = new Map<
      string,
      { wins: number; gamesWon: number; gamesLost: number; ratio: number }
    >();

    for (const row of tiedRows) {
      miniStats.set(row.entry_id, {
        wins: 0,
        gamesWon: 0,
        gamesLost: 0,
        ratio: 0,
      });
    }

    for (const match of groupMatches) {
      if (match.status !== "completed" || !match.winner_entry_id) continue;
      if (!tiedIds.has(match.player1_entry_id) || !tiedIds.has(match.player2_entry_id)) continue;

      const p1 = miniStats.get(match.player1_entry_id);
      const p2 = miniStats.get(match.player2_entry_id);
      if (!p1 || !p2) continue;

      if (match.winner_entry_id === match.player1_entry_id) {
        p1.wins += 1;
      } else if (match.winner_entry_id === match.player2_entry_id) {
        p2.wins += 1;
      }

      const parsed = parseScore(match.score_text);
      if (parsed) {
        p1.gamesWon += parsed.p1;
        p1.gamesLost += parsed.p2;
        p2.gamesWon += parsed.p2;
        p2.gamesLost += parsed.p1;
      }
    }

    for (const row of tiedRows) {
      const stat = miniStats.get(row.entry_id)!;
      stat.ratio = calcRatio(stat.gamesWon, stat.gamesLost);
    }

    tiedRows.sort((a, b) => {
      const sa = miniStats.get(a.entry_id)!;
      const sb = miniStats.get(b.entry_id)!;

      if (sa.wins !== sb.wins) return sb.wins - sa.wins;
      if (sa.ratio !== sb.ratio) return sb.ratio - sa.ratio;

      const overall = compareStandingsRows(a, b, directWinnerMap);
      if (overall !== 0) return overall;

      return a.slot_no - b.slot_no;
    });

    resolved.push(...tiedRows);
  }

  return resolved;
}

function buildMatrix(params: {
  groupMembers: MemberRow[];
  groupMatches: MatchRow[];
}) {
  const { groupMembers, groupMatches } = params;
  const matrix = new Map<string, string>();

  for (const member of groupMembers) {
    matrix.set(`${member.entry_id}:${member.entry_id}`, "");
  }

  for (const match of groupMatches) {
    const parsed = parseScore(match.score_text);
    const p1Score = parsed?.p1 ?? null;
    const p2Score = parsed?.p2 ?? null;

    if (match.status === "completed" && match.winner_entry_id) {
      const p1Won = match.winner_entry_id === match.player1_entry_id;
      const p2Won = match.winner_entry_id === match.player2_entry_id;

      const p1Text =
        p1Score !== null && p2Score !== null
          ? `${p1Won ? "○" : "×"} ${p1Score}-${p2Score}`
          : p1Won
            ? "○"
            : "×";

      const p2Text =
        p1Score !== null && p2Score !== null
          ? `${p2Won ? "○" : "×"} ${p2Score}-${p1Score}`
          : p2Won
            ? "○"
            : "×";

      matrix.set(`${match.player1_entry_id}:${match.player2_entry_id}`, p1Text);
      matrix.set(`${match.player2_entry_id}:${match.player1_entry_id}`, p2Text);
    } else {
      matrix.set(`${match.player1_entry_id}:${match.player2_entry_id}`, "");
      matrix.set(`${match.player2_entry_id}:${match.player1_entry_id}`, "");
    }
  }

  return matrix;
}

export default function LeagueResultsClient({
  tournamentId,
  divisionId,
  tournamentName,
  divisionName,
  entries,
  groups,
  members,
  matches,
}: Props) {
  const router = useRouter();

  const entryMap = useMemo(() => {
    const map = new Map<string, EntryRow>();
    for (const entry of entries) map.set(entry.id, entry);
    return map;
  }, [entries]);

  const membersByGroup = useMemo(() => {
    const map = new Map<string, MemberRow[]>();
    for (const member of members) {
      if (!map.has(member.group_id)) map.set(member.group_id, []);
      map.get(member.group_id)!.push(member);
    }
    for (const value of map.values()) {
      value.sort((a, b) => a.slot_no - b.slot_no);
    }
    return map;
  }, [members]);

  const matchesByGroup = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    for (const match of matches) {
      if (!map.has(match.group_id)) map.set(match.group_id, []);
      map.get(match.group_id)!.push(match);
    }
    for (const value of map.values()) {
      value.sort((a, b) => {
        if (a.round_no !== b.round_no) return a.round_no - b.round_no;
        if (a.slot_no !== b.slot_no) return a.slot_no - b.slot_no;
        return a.match_no - b.match_no;
      });
    }
    return map;
  }, [matches]);

  const orderedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      const groupA = groups.find((g) => g.id === a.group_id)?.group_no ?? 9999;
      const groupB = groups.find((g) => g.id === b.group_id)?.group_no ?? 9999;
      if (groupA !== groupB) return groupA - groupB;
      if (a.round_no !== b.round_no) return a.round_no - b.round_no;
      if (a.slot_no !== b.slot_no) return a.slot_no - b.slot_no;
      return a.match_no - b.match_no;
    });
  }, [matches, groups]);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [winnerEntryId, setWinnerEntryId] = useState<string>("");
  const [player1Games, setPlayer1Games] = useState<string>("3");
  const [player2Games, setPlayer2Games] = useState<string>("0");
  const [gameInputs, setGameInputs] = useState<GameInputRow[]>(
    Array.from({ length: 7 }, () => ({ p1: "", p2: "" }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isReporting, setIsReporting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedMatch = useMemo(
    () => orderedMatches.find((m) => m.id === selectedMatchId) ?? null,
    [orderedMatches, selectedMatchId]
  );

  const selectedIndex = selectedMatch
    ? orderedMatches.findIndex((m) => m.id === selectedMatch.id)
    : -1;

  function openMatchModal(match: MatchRow) {
    const group = groups.find((g) => g.id === match.group_id);
    if (group?.results_confirmed) return;

    setSelectedMatchId(match.id);
    setErrorMessage("");

    const parsed = parseScore(match.score_text);
    setWinnerEntryId(match.winner_entry_id ?? "");
    setPlayer1Games(parsed ? String(parsed.p1) : "3");
    setPlayer2Games(parsed ? String(parsed.p2) : "0");

    const currentScores = Array.isArray(match.game_scores) ? match.game_scores : [];
    const nextRows = Array.from({ length: 7 }, (_, i) => ({
      p1:
        currentScores[i]?.p1 === null || currentScores[i]?.p1 === undefined
          ? ""
          : String(currentScores[i].p1),
      p2:
        currentScores[i]?.p2 === null || currentScores[i]?.p2 === undefined
          ? ""
          : String(currentScores[i].p2),
    }));
    setGameInputs(nextRows);
  }

  function closeModal() {
    setSelectedMatchId(null);
    setErrorMessage("");
  }

  function goToRelativeMatch(delta: number) {
    if (!selectedMatch) return;
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= orderedMatches.length) return;
    openMatchModal(orderedMatches[nextIndex]);
  }

  async function saveMatch(clear = false) {
    if (!selectedMatch) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const counted = countGamesFromRows(gameInputs);

      const formData = new FormData();
      formData.append("tournamentId", tournamentId);
      formData.append("divisionId", divisionId);
      formData.append("matchId", selectedMatch.id);

      if (clear) {
        formData.append("clear", "1");
      } else {
        formData.append("winnerEntryId", winnerEntryId);
        formData.append("player1Games", player1Games);
        formData.append("player2Games", player2Games);
        formData.append("gameScores", JSON.stringify(gameInputs));

        if (
          Number(player1Games) !== counted.p1Wins ||
          Number(player2Games) !== counted.p2Wins
        ) {
          throw new Error("各ゲームの点数から集計したゲーム数と、入力したゲーム数が一致していません。");
        }
      }

      const res = await fetch("/api/leagues/update-match", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "保存に失敗しました。");
      }

      closeModal();
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function reportGroupResults(groupId: string) {
    const confirmed = window.confirm(
      "このリーグの試合結果に間違いありませんか？\nリーグの試合結果を確定させて大丈夫ですか？"
    );

    if (!confirmed) return;

    setIsReporting(groupId);

    try {
      const formData = new FormData();
      formData.append("tournamentId", tournamentId);
      formData.append("divisionId", divisionId);
      formData.append("groupId", groupId);

      const res = await fetch("/api/leagues/report-group-results", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "リーグ結果報告に失敗しました。");
      }

      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "リーグ結果報告に失敗しました。");
    } finally {
      setIsReporting(null);
    }
  }

  const countedGameWins = countGamesFromRows(gameInputs);

  return (
    <>
      <style>{`
        .league-grid {
          display: grid;
          gap: 24px;
        }
        .league-box {
          border: 1px solid #222;
          padding: 0;
          background: #fff;
        }
        .league-title {
          font-weight: 700;
          font-size: 18px;
          text-align: center;
          border-bottom: 1px solid #222;
          background: #d9e8e8;
          padding: 8px 12px;
        }
        .group-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }
        .group-table th,
        .group-table td {
          border: 1px solid #222;
          padding: 3px;
          vertical-align: middle;
        }
        .slot-cell {
          width: 22px;
          text-align: center;
          font-size: 11px;
        }
        .name-cell {
          width: 180px;
          font-size: 12px;
          line-height: 1.2;
          padding: 0 6px;
        }
        .name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 28px;
          white-space: nowrap;
          overflow: hidden;
        }
        .player-name-inline {
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: left;
        }
        .player-aff-inline {
          flex: 0 0 auto;
          color: #555;
          font-size: 11px;
          white-space: nowrap;
          text-align: right;
        }
        .matrix-head {
          width: 60px;
          text-align: center;
          font-size: 11px;
        }
        .matrix-cell {
          height: 40px;
          text-align: center;
          font-size: 11px;
          cursor: pointer;
          background: #fff;
          position: relative;
        }
        .matrix-cell:hover {
          background: #eef6ff;
        }
        .matrix-cell.locked {
          background: #fafafa;
          cursor: default;
        }
        .diag-cell {
          background:
            linear-gradient(to bottom right, transparent 48%, #222 49%, #222 51%, transparent 52%);
          cursor: default;
        }
        .point-col,
        .rank-col {
          width: 50px;
          text-align: center;
          font-size: 11px;
        }
        .result-text {
          display: block;
          line-height: 1.2;
        }
        .order-badge {
          position: absolute;
          top: 2px;
          right: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #d40000;
          line-height: 1;
        }
        .header-actions {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-left: 12px;
        }
        .report-button {
          padding: 6px 10px;
          border: 1px solid #999;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          font-size: 12px;
        }
        .report-badge {
          font-size: 12px;
          color: green;
          font-weight: 700;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
        }
        .modal-card {
          width: 100%;
          max-width: 760px;
          background: white;
          border-radius: 12px;
          border: 1px solid #ccc;
          padding: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .modal-grid {
          display: grid;
          gap: 14px;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .input-row {
          display: grid;
          gap: 8px;
        }
        .score-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .game-row-grid {
          display: grid;
          grid-template-columns: 56px 1fr 1fr;
          gap: 8px;
          align-items: center;
        }
        .simple-input, .simple-select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 8px;
          font-size: 14px;
          background: white;
          box-sizing: border-box;
        }
        .simple-button {
          padding: 10px 14px;
          border: 1px solid #ccc;
          border-radius: 8px;
          background: white;
          cursor: pointer;
        }
        .simple-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ marginBottom: "8px" }}>リーグ結果入力</h1>
        <p style={{ marginBottom: "8px" }}>大会: {tournamentName}</p>
        <p style={{ marginBottom: "0" }}>種目: {divisionName}</p>
      </div>

      <p style={{ marginBottom: "24px", color: "#555" }}>
        対戦セル右上の赤い数字が試合順です。結果を入力すると数字は消えます。
        各リーグの全試合終了後に「リーグの結果を報告する」を押すと、その時点でそのリーグのレート計算をまとめて行います。
      </p>

      {groups.length === 0 ? (
        <p>リーグがまだ生成されていません。</p>
      ) : (
        <div className="league-grid">
          {groups.map((group) => {
            const groupMembers = membersByGroup.get(group.id) ?? [];
            const groupMatches = matchesByGroup.get(group.id) ?? [];
            const standings = buildStandings({
              groupMembers,
              groupMatches,
              entryMap,
            });
            const matrix = buildMatrix({
              groupMembers,
              groupMatches,
            });

            const allCompleted =
              groupMatches.length > 0 &&
              groupMatches.every((match) => match.status === "completed");

            const standingMap = new Map<string, StandingRow>();
            const rankMap = new Map<string, number>();
            standings.forEach((row, index) => {
              standingMap.set(row.entry_id, row);
              rankMap.set(row.entry_id, index + 1);
            });

            const matchMap = new Map<string, MatchRow>();
            for (const match of groupMatches) {
              matchMap.set(`${match.player1_entry_id}:${match.player2_entry_id}`, match);
              matchMap.set(`${match.player2_entry_id}:${match.player1_entry_id}`, match);
            }

            return (
              <div key={group.id} className="league-box">
                <div className="league-title">
                  {group.name}
                  <span className="header-actions">
                    <span style={{ fontSize: "12px", fontWeight: 400 }}>
                      コート: {(group.table_numbers ?? []).length > 0 ? group.table_numbers.join(", ") : "未設定"}
                    </span>

                    {group.results_confirmed ? (
                      <span className="report-badge">報告済み</span>
                    ) : allCompleted ? (
                      <button
                        className="report-button"
                        onClick={() => reportGroupResults(group.id)}
                        disabled={isReporting === group.id}
                      >
                        {isReporting === group.id
                          ? "報告中..."
                          : "リーグの結果を報告する"}
                      </button>
                    ) : null}
                  </span>
                </div>

                <table className="group-table">
                  <colgroup>
                    <col style={{ width: "22px" }} />
                    <col style={{ width: "180px" }} />
                    {groupMembers.map((member) => (
                      <col key={member.id} style={{ width: "60px" }} />
                    ))}
                    <col style={{ width: "50px" }} />
                    <col style={{ width: "50px" }} />
                  </colgroup>

                  <thead>
                    <tr>
                      <th colSpan={2}>選手</th>
                      {groupMembers.map((member) => (
                        <th key={member.id} className="matrix-head">
                          {toCircledNumber(member.slot_no)}
                        </th>
                      ))}
                      <th className="point-col">得点</th>
                      <th className="rank-col">順位</th>
                    </tr>
                  </thead>

                  <tbody>
                    {groupMembers.map((member) => {
                      const entry = entryMap.get(member.entry_id);
                      const standing = standingMap.get(member.entry_id);

                      return (
                        <tr key={member.id}>
                          <td className="slot-cell">{toCircledNumber(member.slot_no)}</td>

                          <td className="name-cell">
                            <div className="name-row">
                              <span className="player-name-inline">
                                {entry?.players?.name ?? "-"}
                              </span>
                              <span className="player-aff-inline">
                                {entry?.players?.affiliation ?? ""}
                              </span>
                            </div>
                          </td>

                          {groupMembers.map((opponent) => {
                            const isSame = member.entry_id === opponent.entry_id;
                            const text = matrix.get(`${member.entry_id}:${opponent.entry_id}`) ?? "";
                            const match = matchMap.get(`${member.entry_id}:${opponent.entry_id}`);

                            if (isSame) {
                              return <td key={opponent.id} className="diag-cell" />;
                            }

                            return (
                              <td
                                key={opponent.id}
                                className={`matrix-cell ${group.results_confirmed ? "locked" : ""}`}
                                onClick={() => {
                                  if (!group.results_confirmed && match) openMatchModal(match);
                                }}
                                title={
                                  group.results_confirmed
                                    ? "このリーグは報告済みです"
                                    : match
                                      ? "クリックして結果入力"
                                      : ""
                                }
                              >
                                {text && <span className="result-text">{text}</span>}
                                {match && match.status !== "completed" && !group.results_confirmed && (
                                  <span className="order-badge">{match.match_no}</span>
                                )}
                              </td>
                            );
                          })}

                          <td className="point-col">{standing?.gamesWon ?? 0}</td>
                          <td className="rank-col">{rankMap.get(member.entry_id) ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-grid">
              <div>
                <h2 style={{ marginTop: 0, marginBottom: "8px" }}>試合結果入力</h2>
                <p style={{ margin: 0 }}>
                  試合順: <span style={{ color: "#d40000", fontWeight: 700 }}>{selectedMatch.match_no}</span>
                </p>
                <p style={{ marginTop: "6px", marginBottom: 0 }}>
                  {entryMap.get(selectedMatch.player1_entry_id)?.players?.name ?? "-"} vs{" "}
                  {entryMap.get(selectedMatch.player2_entry_id)?.players?.name ?? "-"}
                </p>
                <p style={{ marginTop: "6px", marginBottom: 0, color: "#666" }}>
                  コート: {selectedMatch.table_no ?? "-"} / ラウンド:
                  {` ${selectedMatch.round_no}`} / スロット: {selectedMatch.slot_no}
                </p>
                <p style={{ marginTop: "6px", marginBottom: 0, color: "#666" }}>
                  審判:{" "}
                  {selectedMatch.referee_entry_id
                    ? entryMap.get(selectedMatch.referee_entry_id)?.players?.name ?? "-"
                    : "未設定"}
                </p>
              </div>

              <div className="input-row">
                <label>勝者</label>
                <select
                  className="simple-select"
                  value={winnerEntryId}
                  onChange={(e) => setWinnerEntryId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  <option value={selectedMatch.player1_entry_id}>
                    {entryMap.get(selectedMatch.player1_entry_id)?.players?.name ?? "-"}
                  </option>
                  <option value={selectedMatch.player2_entry_id}>
                    {entryMap.get(selectedMatch.player2_entry_id)?.players?.name ?? "-"}
                  </option>
                </select>
              </div>

              <div className="score-grid">
                <div className="input-row">
                  <label>
                    {entryMap.get(selectedMatch.player1_entry_id)?.players?.name ?? "-"} のゲーム数
                  </label>
                  <input
                    className="simple-input"
                    type="number"
                    min={0}
                    value={player1Games}
                    onChange={(e) => setPlayer1Games(e.target.value)}
                  />
                </div>

                <div className="input-row">
                  <label>
                    {entryMap.get(selectedMatch.player2_entry_id)?.players?.name ?? "-"} のゲーム数
                  </label>
                  <input
                    className="simple-input"
                    type="number"
                    min={0}
                    value={player2Games}
                    onChange={(e) => setPlayer2Games(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-row">
                <label>各ゲームの点数</label>
                <div style={{ display: "grid", gap: "8px" }}>
                  {gameInputs.map((row, index) => (
                    <div key={index} className="game-row-grid">
                      <div>{index + 1}G</div>
                      <input
                        className="simple-input"
                        type="number"
                        min={0}
                        value={row.p1}
                        onChange={(e) => {
                          const next = [...gameInputs];
                          next[index] = { ...next[index], p1: e.target.value };
                          setGameInputs(next);
                        }}
                        placeholder={entryMap.get(selectedMatch.player1_entry_id)?.players?.name ?? "-"}
                      />
                      <input
                        className="simple-input"
                        type="number"
                        min={0}
                        value={row.p2}
                        onChange={(e) => {
                          const next = [...gameInputs];
                          next[index] = { ...next[index], p2: e.target.value };
                          setGameInputs(next);
                        }}
                        placeholder={entryMap.get(selectedMatch.player2_entry_id)?.players?.name ?? "-"}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ color: "#555", fontSize: "13px" }}>
                各ゲーム点数からの集計: {countedGameWins.p1Wins} - {countedGameWins.p2Wins}
              </div>

              {errorMessage && (
                <p style={{ color: "crimson", margin: 0 }}>{errorMessage}</p>
              )}

              <div className="modal-actions">
                <button
                  className="simple-button"
                  onClick={() => goToRelativeMatch(-1)}
                  disabled={selectedIndex <= 0 || isSaving}
                >
                  前の試合
                </button>

                <button
                  className="simple-button"
                  onClick={() => goToRelativeMatch(1)}
                  disabled={selectedIndex < 0 || selectedIndex >= orderedMatches.length - 1 || isSaving}
                >
                  次の試合
                </button>

                <button
                  className="simple-button"
                  onClick={() => saveMatch(false)}
                  disabled={isSaving}
                >
                  保存
                </button>

                <button
                  className="simple-button"
                  onClick={() => saveMatch(true)}
                  disabled={isSaving}
                >
                  クリア
                </button>

                <button className="simple-button" onClick={closeModal} disabled={isSaving}>
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
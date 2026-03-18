import { buildTeamMatchBoards } from "@/lib/team/buildTeamMatchBoards";

export type TeamOrderSelection = {
  boardNo: number;
  matchType: "W" | "S" | "T";
  memberIds: string[];
};

export function buildOrderLineLabel(params: {
  matchType: "W" | "S" | "T";
  memberNames: string[];
}) {
  const { matchType, memberNames } = params;

  if (matchType === "W") {
    return memberNames.filter(Boolean).join(" / ");
  }

  return memberNames[0] ?? "";
}

export function validateInitialOrderSelections(params: {
  format: string;
  selections: TeamOrderSelection[];
}) {
  const { format, selections } = params;
  const boards = buildTeamMatchBoards(format);
  const requiredBoards = boards.filter((b) => b.requiredAtInitialOrder);

  for (const board of requiredBoards) {
    const selection = selections.find((s) => s.boardNo === board.boardNo);
    if (!selection) {
      throw new Error(`${board.label} の入力がありません。`);
    }

    if (board.type === "W") {
      if (selection.memberIds.length !== 2) {
        throw new Error(`${board.label} は2名選択してください。`);
      }
      if (selection.memberIds[0] === selection.memberIds[1]) {
        throw new Error(`${board.label} で同じ選手は選べません。`);
      }
    } else {
      if (selection.memberIds.length !== 1) {
        throw new Error(`${board.label} は1名選択してください。`);
      }
    }
  }
}

export function validateFifthBoardSelection(params: {
  format: string;
  boardNo: number;
  memberIds: string[];
}) {
  const { format, boardNo, memberIds } = params;
  const boards = buildTeamMatchBoards(format);
  const board = boards.find((b) => b.boardNo === boardNo);

  if (!board) {
    throw new Error("対象ボードが見つかりません。");
  }

  if (format !== "T_LEAGUE" || boardNo !== 5) {
    throw new Error("この操作はTリーグ方式5番専用です。");
  }

  if (board.type === "W") {
    if (memberIds.length !== 2) {
      throw new Error("5番がダブルスの場合は2名必要です。");
    }
    if (memberIds[0] === memberIds[1]) {
      throw new Error("同じ選手は選べません。");
    }
  } else {
    if (memberIds.length !== 1) {
      throw new Error("5番は1名選択してください。");
    }
  }
}

export function countTeamWinsAfterBoard4(
  games: Array<{ board_no: number; winner_side: string | null }>
) {
  let team1Wins = 0;
  let team2Wins = 0;

  for (const game of games) {
    if (game.board_no > 4) continue;
    if (game.winner_side === "team1") team1Wins += 1;
    if (game.winner_side === "team2") team2Wins += 1;
  }

  return { team1Wins, team2Wins };
}
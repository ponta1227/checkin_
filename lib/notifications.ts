type LeagueFinishedArgs = {
  divisionName: string;
  groupName: string;
  isLeagueKnockout?: boolean;
};

type MatchFinishedArgs = {
  divisionName: string;
  roundLabel: string;
  matchNo: number | string;
  tableNo: string | null;
  player1Name: string;
  player2Name: string;
  bracketLabel?: string | null;
};

export function buildLeagueFinishedMessage({
  divisionName,
  groupName,
  isLeagueKnockout = false,
}: LeagueFinishedArgs) {
  return [
    isLeagueKnockout ? "【予選リーグ終了】" : "【リーグ終了】",
    `種目: ${divisionName}`,
    `対象: ${groupName}`,
    "リーグ内の全試合が終了しました。",
  ].join("\n");
}

export function buildMatchFinishedMessage({
  divisionName,
  roundLabel,
  matchNo,
  tableNo,
  player1Name,
  player2Name,
  bracketLabel,
}: MatchFinishedArgs) {
  const lines = ["【試合終了】", `種目: ${divisionName}`];

  if (bracketLabel) {
    lines.push(`区分: ${bracketLabel}`);
  }

  lines.push(
    `回戦: ${roundLabel}`,
    `試合番号: 第${matchNo}試合`,
    `台: ${tableNo ? `${tableNo}番台` : "-"}`,
    `対戦: ${player1Name} vs ${player2Name}`
  );

  return lines.join("\n");
}

export function getKnockoutRoundLabel(roundNo: number, totalRounds?: number | null) {
  if (!totalRounds || totalRounds < 1) {
    return `${roundNo}回戦`;
  }

  if (roundNo === totalRounds) return "決勝";
  if (roundNo === totalRounds - 1) return "準決勝";
  if (roundNo === totalRounds - 2) return "準々決勝";

  return `${roundNo}回戦`;
}

export function getBracketLabel(bracketType: string | null | undefined) {
  const type = String(bracketType ?? "");

  if (type === "main") return null;
  if (type === "upper") return "上位トーナメント";
  if (type === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(type)) {
    return `${type.replace("rank_", "")}位トーナメント`;
  }

  return type || null;
}
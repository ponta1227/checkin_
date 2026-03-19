export type GroupStandingRow = {
  entry_id: string;
  rank: number;
};

export type GroupStanding = {
  group_id: string;
  standings: GroupStandingRow[];
};

export type RankSource = {
  entry_id: string;
  source_group_id: string;
  source_rank: number;
};

function parseRankBracketType(bracketType: string): number | null {
  const match = /^rank_(\d+)$/.exec(bracketType);
  if (!match) return null;

  const rank = Number(match[1]);
  if (!Number.isInteger(rank) || rank <= 0) return null;

  return rank;
}

function getBaseGroupSize(groups: GroupStanding[]): number {
  const sizes = groups
    .map((group) => group.standings.length)
    .filter((size) => size > 0);

  if (sizes.length === 0) return 0;

  return Math.min(...sizes);
}

function getTargetRanksForGroup(
  targetRank: number,
  groupSize: number,
  baseGroupSize: number
): number[] {
  if (groupSize <= 0 || targetRank <= 0) return [];

  // 例:
  // 基本3人リーグ + 1つだけ4人リーグ
  // rank_3 を作るとき
  // - 3人リーグ -> [3]
  // - 4人リーグ -> [3,4]
  //
  // つまり「基準人数の最終順位トーナメント」は、
  // その順位以上の余剰下位順位も同じトーナメントへ吸収する。
  if (baseGroupSize > 0 && targetRank === baseGroupSize) {
    const ranks: number[] = [];
    for (let rank = targetRank; rank <= groupSize; rank += 1) {
      ranks.push(rank);
    }
    return ranks;
  }

  if (targetRank > groupSize) return [];
  return [targetRank];
}

/**
順位別トーナメント用の出場者選定
 *
仕様:
- rank_1 -> 各リーグ1位
- rank_2 -> 各リーグ2位
- rank_3 -> 基本3人リーグなら各リーグ3位
  ただし4人リーグが混ざるなら、その4位も rank_3 に追加
 *
より一般化すると、
「最小リーグ人数に対応する順位トーナメント」は、
その順位より下の余剰順位も同じトーナメントへ吸収する。
 */
export function selectRankSourcesForBracket(
  bracketType: string,
  groups: GroupStanding[]
): RankSource[] {
  const targetRank = parseRankBracketType(bracketType);
  if (targetRank === null) return [];

  const baseGroupSize = getBaseGroupSize(groups);

  const sources: RankSource[] = [];

  for (const group of groups) {
    const groupSize = group.standings.length;
    const targetRanks = getTargetRanksForGroup(
      targetRank,
      groupSize,
      baseGroupSize
    );

    if (targetRanks.length === 0) continue;

    const targetRankSet = new Set(targetRanks);

    for (const row of group.standings) {
      if (!row.entry_id) continue;
      if (!targetRankSet.has(row.rank)) continue;

      sources.push({
        entry_id: row.entry_id,
        source_group_id: group.group_id,
        source_rank: row.rank,
      });
    }
  }

  return sources;
}
export type LeagueStandingRow = {
  group_id: string;
  entry_id: string;
  rank: number;
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

export function buildRankBracketSources(
  bracketType: string,
  standingRows: LeagueStandingRow[]
): RankSource[] {
  const targetRank = parseRankBracketType(bracketType);
  if (targetRank === null) return [];

  const groupMap = new Map<string, LeagueStandingRow[]>();

  for (const row of standingRows) {
    const rows = groupMap.get(row.group_id) ?? [];
    rows.push(row);
    groupMap.set(row.group_id, rows);
  }

  const groupSizes = [...groupMap.values()]
    .map((rows) => rows.length)
    .filter((size) => size > 0);

  const baseGroupSize =
    groupSizes.length > 0 ? Math.min(...groupSizes) : 0;

  const sources: RankSource[] = [];

  for (const [groupId, rows] of groupMap.entries()) {
    const sortedRows = [...rows].sort((a, b) => a.rank - b.rank);
    const groupSize = sortedRows.length;

    // rank_3 生成時に、
    // 基本が3人リーグで一部4人リーグなら 4位も同じ3位トーナメントへ入れる
    if (targetRank === baseGroupSize && baseGroupSize > 0) {
      for (const row of sortedRows) {
        if (row.rank >= targetRank && row.rank <= groupSize) {
          sources.push({
            entry_id: row.entry_id,
            source_group_id: groupId,
            source_rank: row.rank,
          });
        }
      }
      continue;
    }

    for (const row of sortedRows) {
      if (row.rank === targetRank) {
        sources.push({
          entry_id: row.entry_id,
          source_group_id: groupId,
          source_rank: row.rank,
        });
      }
    }
  }

  return sources;
}
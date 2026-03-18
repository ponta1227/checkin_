export type BracketLikeMatch = {
  id: string;
  round_no: number;
  match_no: number;
};

export type BracketSegment<T extends BracketLikeMatch> = {
  baseRoundNo: number;
  segmentStart: number;
  segmentEnd: number;
  matches: T[];
};

export type BracketPage<T extends BracketLikeMatch> = {
  pageNo: number;
  baseRoundNo: number;
  segments: BracketSegment<T>[];
};

export function getOriginalLeafRange(match: BracketLikeMatch) {
  const span = Math.pow(2, match.round_no - 1);
  const start = (match.match_no - 1) * span + 1;
  const end = start + span - 1;
  return { start, end, span };
}

export function getRelativeLeafRange(
  match: BracketLikeMatch,
  baseRoundNo: number
) {
  const original = getOriginalLeafRange(match);
  const divisor = Math.pow(2, baseRoundNo - 1);

  const start = Math.floor((original.start - 1) / divisor) + 1;
  const end = Math.floor((original.end - 1) / divisor) + 1;
  const span = original.span / divisor;

  return { start, end, span };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildBracketPages<T extends BracketLikeMatch>(
  matches: T[],
  firstRoundMatchesPerColumn = 16,
  columnsPerPage = 2
): BracketPage<T>[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.round_no !== b.round_no) return a.round_no - b.round_no;
    return a.match_no - b.match_no;
  });

  if (sorted.length === 0) return [];

  const pages: BracketPage<T>[] = [];
  let pageNo = 1;
  let currentBaseRoundNo = 1;
  let remaining = [...sorted];

  while (remaining.length > 0) {
    const displayable = remaining.filter((match) => {
      const rel = getRelativeLeafRange(match, currentBaseRoundNo);
      return rel.span <= firstRoundMatchesPerColumn;
    });

    if (displayable.length === 0) break;

    const segmentMap = new Map<number, T[]>();

    for (const match of displayable) {
      const rel = getRelativeLeafRange(match, currentBaseRoundNo);
      const segmentIndex = Math.floor(
        (rel.start - 1) / firstRoundMatchesPerColumn
      );

      if (!segmentMap.has(segmentIndex)) {
        segmentMap.set(segmentIndex, []);
      }
      segmentMap.get(segmentIndex)!.push(match);
    }

    const orderedSegments: BracketSegment<T>[] = [...segmentMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([segmentIndex, segmentMatches]) => {
        const segmentStart = segmentIndex * firstRoundMatchesPerColumn + 1;
        const segmentEnd = segmentStart + firstRoundMatchesPerColumn - 1;

        return {
          baseRoundNo: currentBaseRoundNo,
          segmentStart,
          segmentEnd,
          matches: segmentMatches.sort((a, b) => {
            if (a.round_no !== b.round_no) return a.round_no - b.round_no;
            return a.match_no - b.match_no;
          }),
        };
      });

    const pageSegments = chunkArray(orderedSegments, columnsPerPage);

    for (const segments of pageSegments) {
      pages.push({
        pageNo,
        baseRoundNo: currentBaseRoundNo,
        segments,
      });
      pageNo += 1;
    }

    const displayedIds = new Set(displayable.map((m) => m.id));
    remaining = remaining.filter((m) => !displayedIds.has(m.id));

    currentBaseRoundNo += Math.log2(firstRoundMatchesPerColumn) + 1;
  }

  return pages;
}
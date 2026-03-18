import { getRelativeLeafRange } from "@/lib/brackets/paginate";

export type PdfBracketMatch = {
  id: string;
  round_no: number;
  match_no: number;
  status: string | null;
  table_no: string | null;
  score_text: string | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  source_group_id_1?: string | null;
  source_rank_1?: number | null;
  source_group_id_2?: string | null;
  source_rank_2?: number | null;
};

export type LayoutNode = {
  match: PdfBracketMatch;
  x: number;
  y: number;
  centerY: number;
  nextCenterY: number | null;
  nextCardLeft: number | null;
  showJoin: boolean;
};

export const PDF_LAYOUT = {
  pageWidth: 842,
  pageHeight: 595,
  margin: 24,
  titleHeight: 42,
  tournamentTextHeight: 16,
  headerGap: 12,
  panelGap: 16,
  panelPadding: 12,
  cardWidth: 130,
  cardHeight: 42,
  rowHeight: 21,
  roundGap: 168,
  circleRadius: 9,
  cardToCircle: 10,
  circleToJoin: 12,
  baseSlotHeight: 58,
};

export function getMatchNumberColor(match: PdfBracketMatch) {
  const bothResolved = !!match.player1_entry_id && !!match.player2_entry_id;
  if (!bothResolved) return "#111111";
  if (match.status === "in_progress") return "#1565c0";
  if (match.status === "completed") return "#888888";
  return "#d40000";
}

export function buildSourceKey(groupId?: string | null, rank?: number | null) {
  if (!groupId || !rank) return "";
  return `${groupId}:${rank}`;
}

export function getDisplayName(params: {
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
  return "-";
}

export function truncateText(text: string, max = 22) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildPanelLayout(params: {
  matches: PdfBracketMatch[];
  baseRoundNo: number;
  segmentStart: number;
}) {
  const { matches, baseRoundNo, segmentStart } = params;

  const roundNos = [...new Set(matches.map((m) => m.round_no))].sort((a, b) => a - b);
  const roundIndexMap = new Map<number, number>();
  roundNos.forEach((roundNo, idx) => roundIndexMap.set(roundNo, idx));

  const maxLeafIndex = Math.max(
    ...matches.map(
      (m) => getRelativeLeafRange(m, baseRoundNo).end - segmentStart + 1
    ),
    1
  );

  const boardWidth =
    (roundNos.length - 1) * PDF_LAYOUT.roundGap + PDF_LAYOUT.cardWidth + 70;
  const boardHeight = maxLeafIndex * PDF_LAYOUT.baseSlotHeight + 24;

  const nodes: LayoutNode[] = matches.map((match) => {
    const range = getRelativeLeafRange(match, baseRoundNo);
    const localStart = range.start - segmentStart + 1;
    const slotTop = (localStart - 1) * PDF_LAYOUT.baseSlotHeight + 24;
    const slotHeight = range.span * PDF_LAYOUT.baseSlotHeight;

    const roundIndex = roundIndexMap.get(match.round_no) ?? 0;
    const x = roundIndex * PDF_LAYOUT.roundGap;
    const centerY = slotTop + slotHeight / 2;
    const y = centerY - PDF_LAYOUT.cardHeight / 2;

    const nextRoundIndex = roundIndexMap.get(match.round_no + 1);
    const showJoin = nextRoundIndex !== undefined;

    let nextCenterY: number | null = null;
    let nextCardLeft: number | null = null;

    if (showJoin) {
      const blockIndex = Math.floor((range.start - 1) / range.span);
      const isTopSibling = blockIndex % 2 === 0;
      const parentStart = isTopSibling ? range.start : range.start - range.span;
      const parentLocalStart = parentStart - segmentStart + 1;
      const parentTop = (parentLocalStart - 1) * PDF_LAYOUT.baseSlotHeight + 24;
      const parentHeight = range.span * 2 * PDF_LAYOUT.baseSlotHeight;

      nextCenterY = parentTop + parentHeight / 2;
      nextCardLeft = (nextRoundIndex ?? 0) * PDF_LAYOUT.roundGap;
    }

    return {
      match,
      x,
      y,
      centerY,
      nextCenterY,
      nextCardLeft,
      showJoin,
    };
  });

  return {
    boardWidth,
    boardHeight,
    roundNos,
    nodes,
  };
}
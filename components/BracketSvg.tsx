import React from "react";
import { getRelativeLeafRange } from "@/lib/brackets/paginate";

type BracketMatch = {
  id: string;
  bracket_id?: string;
  round_no: number;
  match_no: number;
  status: string | null;
  table_no: string | null;
  score_text: string | null;
  game_scores?: Array<{ p1: number | null; p2: number | null }> | null;
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
  title: string;
  segmentTitle?: string;
  matches: BracketMatch[];
  baseRoundNo: number;
  segmentStart: number;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
  onMatchClick?: (match: BracketMatch) => void;
  fit?: "natural" | "responsive";
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
  return "-";
}

function getMatchNumberColor(match: BracketMatch) {
  const bothResolved = !!match.player1_entry_id && !!match.player2_entry_id;

  if (!bothResolved) return "#111";
  if (match.status === "in_progress") return "#1565c0";
  if (match.status === "completed") return "#888";
  return "#d40000";
}

function truncateText(text: string, max = 26) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export default function BracketSvg({
  title,
  segmentTitle,
  matches,
  baseRoundNo,
  segmentStart,
  entryLabelMap,
  placeholderLabelMap,
  onMatchClick,
  fit = "natural",
}: Props) {
  const roundMap = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    if (!roundMap.has(match.round_no)) roundMap.set(match.round_no, []);
    roundMap.get(match.round_no)!.push(match);
  }

  const rounds = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNo, roundMatches]) => ({
      roundNo,
      matches: [...roundMatches].sort((a, b) => a.match_no - b.match_no),
    }));

  const localRoundNos = rounds.map((r) => r.roundNo);
  const localRoundIndexMap = new Map<number, number>();
  localRoundNos.forEach((roundNo, idx) => localRoundIndexMap.set(roundNo, idx));

  const L = {
    headerHeight: 34,
    cardWidth: 170,
    cardHeight: 56,
    rowHeight: 28,
    roundGap: 225,
    circleSize: 24,
    cardToCircle: 12,
    circleToJoin: 16,
    metaGap: 4,
    metaHeight: 24,
    baseSlotHeight: 100,
    leftPad: 6,
    topPad: 10,
  };

  const maxLeafIndex = Math.max(
    ...matches.map(
      (m) => getRelativeLeafRange(m, baseRoundNo).end - segmentStart + 1
    ),
    1
  );

  const boardHeight = maxLeafIndex * L.baseSlotHeight;
  const boardWidth = (rounds.length - 1) * L.roundGap + L.cardWidth + 100;
  const totalWidth = boardWidth + L.leftPad * 2;
  const totalHeight = L.headerHeight + boardHeight + 40;

  const renderedWidth = fit === "responsive" ? "100%" : totalWidth;
  const renderedHeight = fit === "responsive" ? "100%" : totalHeight;

  const titleText = segmentTitle ? `${title} / ${segmentTitle}` : title;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      width={renderedWidth}
      height={renderedHeight}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: "block", background: "white" }}
    >
      <text
        x={L.leftPad}
        y={20}
        fontSize={14}
        fontWeight={700}
        fill="#111"
      >
        {titleText}
      </text>

      {rounds.map((round) => {
        const roundIndex = localRoundIndexMap.get(round.roundNo) ?? 0;
        const x = L.leftPad + roundIndex * L.roundGap;

        return (
          <text
            key={`round-title-${round.roundNo}`}
            x={x}
            y={L.headerHeight}
            fontSize={12}
            fontWeight={700}
            fill="#111"
          >
            {round.roundNo}回戦
          </text>
        );
      })}

      {rounds.map((round) => {
        const roundIndex = localRoundIndexMap.get(round.roundNo) ?? 0;
        const x = L.leftPad + roundIndex * L.roundGap;

        return round.matches.map((match) => {
          const range = getRelativeLeafRange(match, baseRoundNo);
          const localStart = range.start - segmentStart + 1;
          const slotTop = L.headerHeight + (localStart - 1) * L.baseSlotHeight + L.topPad;
          const slotHeight = range.span * L.baseSlotHeight;

          const centerY = slotTop + slotHeight / 2;
          const cardTop = centerY - L.cardHeight / 2;
          const metaTop = cardTop + L.cardHeight + L.metaGap;

          const circleCenterX =
            x + L.cardWidth + L.cardToCircle + L.circleSize / 2;
          const circleCenterY = centerY;

          const joinX =
            x +
            L.cardWidth +
            L.cardToCircle +
            L.circleSize +
            L.circleToJoin;

          const nextRoundIndex = localRoundIndexMap.get(match.round_no + 1);
          const showJoin = nextRoundIndex !== undefined;

          let nextCenterY = centerY;
          let nextCardLeft = 0;

          if (showJoin) {
            const blockIndex = Math.floor((range.start - 1) / range.span);
            const isTopSibling = blockIndex % 2 === 0;
            const parentStart = isTopSibling
              ? range.start
              : range.start - range.span;
            const parentLocalStart = parentStart - segmentStart + 1;
            const parentTop =
              L.headerHeight + (parentLocalStart - 1) * L.baseSlotHeight + L.topPad;
            const parentHeight = range.span * 2 * L.baseSlotHeight;

            nextCenterY = parentTop + parentHeight / 2;
            nextCardLeft =
              L.leftPad + (nextRoundIndex ?? 0) * L.roundGap;
          }

          const player1Label = truncateText(
            getDisplayName({
              entryId: match.player1_entry_id,
              otherEntryId: match.player2_entry_id,
              sourceGroupId: match.source_group_id_1,
              sourceRank: match.source_rank_1,
              entryLabelMap,
              placeholderLabelMap,
            }),
            28
          );

          const player2Label = truncateText(
            getDisplayName({
              entryId: match.player2_entry_id,
              otherEntryId: match.player1_entry_id,
              sourceGroupId: match.source_group_id_2,
              sourceRank: match.source_rank_2,
              entryLabelMap,
              placeholderLabelMap,
            }),
            28
          );

          const matchNoColor = getMatchNumberColor(match);
          const clickable = !!onMatchClick;

          return (
            <g key={match.id}>
              <rect
                x={x}
                y={cardTop}
                width={L.cardWidth}
                height={L.cardHeight}
                fill="#fff"
                stroke="#222"
                strokeWidth={1}
              />
              <line
                x1={x}
                y1={cardTop + L.rowHeight}
                x2={x + L.cardWidth}
                y2={cardTop + L.rowHeight}
                stroke="#bbb"
                strokeWidth={1}
              />

              <text
                x={x + 7}
                y={cardTop + 18}
                fontSize={10}
                fill="#111"
              >
                {player1Label}
              </text>
              <text
                x={x + 7}
                y={cardTop + L.rowHeight + 18}
                fontSize={10}
                fill="#111"
              >
                {player2Label}
              </text>

              <line
                x1={x + L.cardWidth}
                y1={centerY}
                x2={circleCenterX - L.circleSize / 2}
                y2={centerY}
                stroke="#222"
                strokeWidth={1}
              />

              {showJoin && (
                <>
                  <line
                    x1={circleCenterX + L.circleSize / 2}
                    y1={centerY}
                    x2={joinX}
                    y2={centerY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <line
                    x1={joinX}
                    y1={Math.min(centerY, nextCenterY)}
                    x2={joinX}
                    y2={Math.max(centerY, nextCenterY)}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <line
                    x1={joinX}
                    y1={nextCenterY}
                    x2={nextCardLeft}
                    y2={nextCenterY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                </>
              )}

              <g
                style={clickable ? { cursor: "pointer" } : undefined}
                onClick={clickable ? () => onMatchClick?.(match) : undefined}
              >
                <circle
                  cx={circleCenterX}
                  cy={circleCenterY}
                  r={L.circleSize / 2}
                  fill="#fff"
                  stroke={matchNoColor}
                  strokeWidth={1.2}
                />
                <text
                  x={circleCenterX}
                  y={circleCenterY + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={matchNoColor}
                >
                  {match.match_no}
                </text>
              </g>

              <text
                x={x}
                y={metaTop + 10}
                fontSize={9}
                fill="#555"
              >
                {`台: ${match.table_no ?? "-"} / 状態: ${match.status ?? "-"}`}
              </text>
              <text
                x={x}
                y={metaTop + 21}
                fontSize={9}
                fill="#555"
              >
                {`スコア: ${match.score_text ?? "-"}`}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
}
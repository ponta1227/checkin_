import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Rect,
  Line,
  Circle,
  StyleSheet,
} from "@react-pdf/renderer";
import { buildBracketPages } from "@/lib/brackets/paginate";
import {
  buildPanelLayout,
  getDisplayName,
  getMatchNumberColor,
  truncateText,
  PDF_LAYOUT,
} from "@/lib/brackets/pdf-layout";

export type PdfBracketMatch = {
  id: string;
  bracket_id: string;
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

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
  },
  tournament: {
    fontSize: 10,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    textAlign: "center",
    border: "2 solid #222",
    backgroundColor: "#d9e8e8",
    padding: 6,
    marginBottom: 10,
  },
  grid2: {
    flexDirection: "row",
    gap: 10,
  },
  grid1: {
    flexDirection: "column",
  },
  panel: {
    flex: 1,
    border: "1 solid #ddd",
    padding: 8,
    backgroundColor: "#fff",
  },
  panelTitle: {
    fontSize: 11,
    marginBottom: 6,
    fontWeight: 700,
  },
});

function PdfBracketPanel(props: {
  title: string;
  segmentTitle: string;
  matches: PdfBracketMatch[];
  baseRoundNo: number;
  segmentStart: number;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
}) {
  const {
    title,
    segmentTitle,
    matches,
    baseRoundNo,
    segmentStart,
    entryLabelMap,
    placeholderLabelMap,
  } = props;

  const layout = buildPanelLayout({
    matches,
    baseRoundNo,
    segmentStart,
  });

  const svgWidth = layout.boardWidth + 10;
  const svgHeight = layout.boardHeight + 10;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{`${title} / ${segmentTitle}`}</Text>

      <Svg width="100%" height={260} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        {layout.roundNos.map((roundNo, idx) => (
          <Text
            key={`r-${roundNo}`}
            x={idx * PDF_LAYOUT.roundGap}
            y={12}
            style={{ fontSize: 9 }}
          >
            {`${roundNo}回戦`}
          </Text>
        ))}

        {layout.nodes.map((node) => {
          const { match, x, y, centerY, nextCenterY, nextCardLeft, showJoin } = node;

          const player1 = truncateText(
            getDisplayName({
              entryId: match.player1_entry_id,
              otherEntryId: match.player2_entry_id,
              sourceGroupId: match.source_group_id_1,
              sourceRank: match.source_rank_1,
              entryLabelMap,
              placeholderLabelMap,
            }),
            24
          );

          const player2 = truncateText(
            getDisplayName({
              entryId: match.player2_entry_id,
              otherEntryId: match.player1_entry_id,
              sourceGroupId: match.source_group_id_2,
              sourceRank: match.source_rank_2,
              entryLabelMap,
              placeholderLabelMap,
            }),
            24
          );

          const circleCx =
            x +
            PDF_LAYOUT.cardWidth +
            PDF_LAYOUT.cardToCircle +
            PDF_LAYOUT.circleRadius;

          const circleCy = centerY;
          const joinX =
            x +
            PDF_LAYOUT.cardWidth +
            PDF_LAYOUT.cardToCircle +
            PDF_LAYOUT.circleRadius * 2 +
            PDF_LAYOUT.circleToJoin;

          const color = getMatchNumberColor(match);

          return (
            <View key={match.id}>
              <Rect
                x={x}
                y={y}
                width={PDF_LAYOUT.cardWidth}
                height={PDF_LAYOUT.cardHeight}
                stroke="#222"
                fill="#fff"
                strokeWidth={1}
              />
              <Line
                x1={x}
                y1={y + PDF_LAYOUT.rowHeight}
                x2={x + PDF_LAYOUT.cardWidth}
                y2={y + PDF_LAYOUT.rowHeight}
                stroke="#bbb"
                strokeWidth={1}
              />

              <Text x={x + 5} y={y + 14} style={{ fontSize: 7.5 }}>
                {player1}
              </Text>
              <Text x={x + 5} y={y + PDF_LAYOUT.rowHeight + 14} style={{ fontSize: 7.5 }}>
                {player2}
              </Text>

              <Line
                x1={x + PDF_LAYOUT.cardWidth}
                y1={centerY}
                x2={circleCx - PDF_LAYOUT.circleRadius}
                y2={centerY}
                stroke="#222"
                strokeWidth={1}
              />

              <Circle
                cx={circleCx}
                cy={circleCy}
                r={PDF_LAYOUT.circleRadius}
                stroke={color}
                fill="#fff"
                strokeWidth={1}
              />
              <Text
                x={circleCx - 3.5}
                y={circleCy + 3}
                style={{ fontSize: 7, color }}
              >
                {String(match.match_no)}
              </Text>

              {showJoin && nextCenterY !== null && nextCardLeft !== null && (
                <>
                  <Line
                    x1={circleCx + PDF_LAYOUT.circleRadius}
                    y1={centerY}
                    x2={joinX}
                    y2={centerY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <Line
                    x1={joinX}
                    y1={Math.min(centerY, nextCenterY)}
                    x2={joinX}
                    y2={Math.max(centerY, nextCenterY)}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <Line
                    x1={joinX}
                    y1={nextCenterY}
                    x2={nextCardLeft}
                    y2={nextCenterY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                </>
              )}

              <Text x={x} y={y + PDF_LAYOUT.cardHeight + 10} style={{ fontSize: 6.5 }}>
                {`台: ${match.table_no ?? "-"} / 状態: ${match.status ?? "-"}`}
              </Text>
              <Text x={x} y={y + PDF_LAYOUT.cardHeight + 18} style={{ fontSize: 6.5 }}>
                {`スコア: ${match.score_text ?? "-"}`}
              </Text>
            </View>
          );
        })}
      </Svg>
    </View>
  );
}

function bracketLabel(bracketType: string) {
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType;
}

export function LeagueKnockoutPdfDocument(props: {
  tournamentName: string;
  divisionName: string;
  targetBrackets: Array<{ id: string; bracket_type: string }>;
  matchesByBracket: Map<string, PdfBracketMatch[]>;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
}) {
  const {
    tournamentName,
    divisionName,
    targetBrackets,
    matchesByBracket,
    entryLabelMap,
    placeholderLabelMap,
  } = props;

  return (
    <Document>
      {targetBrackets.flatMap((bracket) => {
        const bracketMatches = matchesByBracket.get(bracket.id) ?? [];
        const pages = buildBracketPages(bracketMatches, 16, 2);
        const label = bracketLabel(String(bracket.bracket_type));

        return pages.map((page) => (
          <Page
            key={`${bracket.id}-${page.pageNo}`}
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            <Text style={styles.tournament}>{tournamentName || "-"}</Text>
            <Text style={styles.title}>
              {`${divisionName} ${label}${pages.length > 1 ? `（${page.pageNo}/${pages.length}）` : ""}`}
            </Text>

            <View style={page.segments.length === 2 ? styles.grid2 : styles.grid1}>
              {page.segments.map((segment) => (
                <PdfBracketPanel
                  key={`${page.pageNo}-${segment.segmentStart}`}
                  title={label}
                  segmentTitle={`${segment.segmentStart}〜${segment.segmentEnd}枠`}
                  matches={segment.matches}
                  baseRoundNo={segment.baseRoundNo}
                  segmentStart={segment.segmentStart}
                  entryLabelMap={entryLabelMap}
                  placeholderLabelMap={placeholderLabelMap}
                />
              ))}
            </View>
          </Page>
        ));
      })}
    </Document>
  );
}
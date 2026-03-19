import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  G,
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

type PdfBracketPanelProps = {
  title: string;
  segmentTitle: string;
  matches: PdfBracketMatch[];
  baseRoundNo: number;
  segmentStart: number;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
};

type LeagueKnockoutPdfDocumentProps = {
  tournamentName: string;
  divisionName: string;
  targetBrackets: Array<{ id: string; bracket_type: string }>;
  matchesByBracket: Map<string, PdfBracketMatch[]>;
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
};

/**
 * @react-pdf/renderer の JSX 型と React / TS の相性で
 * 「does not have a 'props' property」が出る環境向けの回避。
 */
const PdfDocument = Document as any;
const PdfPage = Page as any;
const PdfText = Text as any;
const PdfView = View as any;
const PdfSvg = Svg as any;
const PdfG = G as any;
const PdfRect = Rect as any;
const PdfLine = Line as any;
const PdfCircle = Circle as any;

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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#222",
    backgroundColor: "#d9e8e8",
    padding: 6,
    marginBottom: 10,
  },
  grid2: {
    flexDirection: "row",
  },
  grid1: {
    flexDirection: "column",
  },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ddd",
    padding: 8,
    backgroundColor: "#fff",
  },
  panelLeft: {
    marginRight: 10,
  },
  panelTitle: {
    fontSize: 11,
    marginBottom: 6,
    fontWeight: "bold",
  },
});

function PdfBracketPanel({
  title,
  segmentTitle,
  matches,
  baseRoundNo,
  segmentStart,
  entryLabelMap,
  placeholderLabelMap,
}: PdfBracketPanelProps) {
  const layout = buildPanelLayout({
    matches,
    baseRoundNo,
    segmentStart,
  });

  const svgWidth = layout.boardWidth + 10;
  const svgHeight = layout.boardHeight + 10;

  return (
    <PdfView style={styles.panel}>
      <PdfText style={styles.panelTitle}>{`${title} / ${segmentTitle}`}</PdfText>

      <PdfSvg width="100%" height={260} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        {layout.roundNos.map((roundNo, idx) => (
          <PdfText
            key={`r-${roundNo}`}
            x={idx * PDF_LAYOUT.roundGap}
            y={12}
            style={{ fontSize: 9 }}
          >
            {`${roundNo}回戦`}
          </PdfText>
        ))}

        {layout.nodes.map((node) => {
          const {
            match,
            x,
            y,
            centerY,
            nextCenterY,
            nextCardLeft,
            showJoin,
          } = node;

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
            <PdfG key={match.id}>
              <PdfRect
                x={x}
                y={y}
                width={PDF_LAYOUT.cardWidth}
                height={PDF_LAYOUT.cardHeight}
                stroke="#222"
                fill="#fff"
                strokeWidth={1}
              />

              <PdfLine
                x1={x}
                y1={y + PDF_LAYOUT.rowHeight}
                x2={x + PDF_LAYOUT.cardWidth}
                y2={y + PDF_LAYOUT.rowHeight}
                stroke="#bbb"
                strokeWidth={1}
              />

              <PdfText x={x + 5} y={y + 14} style={{ fontSize: 7.5 }}>
                {player1}
              </PdfText>

              <PdfText
                x={x + 5}
                y={y + PDF_LAYOUT.rowHeight + 14}
                style={{ fontSize: 7.5 }}
              >
                {player2}
              </PdfText>

              <PdfLine
                x1={x + PDF_LAYOUT.cardWidth}
                y1={centerY}
                x2={circleCx - PDF_LAYOUT.circleRadius}
                y2={centerY}
                stroke="#222"
                strokeWidth={1}
              />

              <PdfCircle
                cx={circleCx}
                cy={circleCy}
                r={PDF_LAYOUT.circleRadius}
                stroke={color}
                fill="#fff"
                strokeWidth={1}
              />

              <PdfText
                x={circleCx - 3.5}
                y={circleCy + 3}
                style={{ fontSize: 7, fill: color }}
              >
                {String(match.match_no)}
              </PdfText>

              {showJoin && nextCenterY !== null && nextCardLeft !== null ? (
                <PdfG>
                  <PdfLine
                    x1={circleCx + PDF_LAYOUT.circleRadius}
                    y1={centerY}
                    x2={joinX}
                    y2={centerY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <PdfLine
                    x1={joinX}
                    y1={Math.min(centerY, nextCenterY)}
                    x2={joinX}
                    y2={Math.max(centerY, nextCenterY)}
                    stroke="#222"
                    strokeWidth={1}
                  />
                  <PdfLine
                    x1={joinX}
                    y1={nextCenterY}
                    x2={nextCardLeft}
                    y2={nextCenterY}
                    stroke="#222"
                    strokeWidth={1}
                  />
                </PdfG>
              ) : null}

              <PdfText
                x={x}
                y={y + PDF_LAYOUT.cardHeight + 10}
                style={{ fontSize: 6.5 }}
              >
                {`台: ${match.table_no ?? "-"} / 状態: ${match.status ?? "-"}`}
              </PdfText>

              <PdfText
                x={x}
                y={y + PDF_LAYOUT.cardHeight + 18}
                style={{ fontSize: 6.5 }}
              >
                {`スコア: ${match.score_text ?? "-"}`}
              </PdfText>
            </PdfG>
          );
        })}
      </PdfSvg>
    </PdfView>
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

export function LeagueKnockoutPdfDocument({
  tournamentName,
  divisionName,
  targetBrackets,
  matchesByBracket,
  entryLabelMap,
  placeholderLabelMap,
}: LeagueKnockoutPdfDocumentProps) {
  return (
    <PdfDocument>
      {targetBrackets.flatMap((bracket) => {
        const bracketMatches = matchesByBracket.get(bracket.id) ?? [];
        const pages = buildBracketPages(bracketMatches, 16, 2);
        const label = bracketLabel(String(bracket.bracket_type));

        return pages.map((page) => (
          <PdfPage
            key={`${bracket.id}-${page.pageNo}`}
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            <PdfText style={styles.tournament}>{tournamentName || "-"}</PdfText>

            <PdfText style={styles.title}>
              {`${divisionName} ${label}${
                pages.length > 1 ? `（${page.pageNo}/${pages.length}）` : ""
              }`}
            </PdfText>

            <PdfView style={page.segments.length === 2 ? styles.grid2 : styles.grid1}>
              {page.segments.map((segment, index) => (
                <PdfView
                  key={`${page.pageNo}-${segment.segmentStart}`}
                  style={index === 0 && page.segments.length === 2 ? styles.panelLeft : undefined}
                >
                  <PdfBracketPanel
                    title={label}
                    segmentTitle={`${segment.segmentStart}〜${segment.segmentEnd}枠`}
                    matches={segment.matches}
                    baseRoundNo={segment.baseRoundNo}
                    segmentStart={segment.segmentStart}
                    entryLabelMap={entryLabelMap}
                    placeholderLabelMap={placeholderLabelMap}
                  />
                </PdfView>
              ))}
            </PdfView>
          </PdfPage>
        ));
      })}
    </PdfDocument>
  );
}
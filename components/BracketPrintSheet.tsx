import React from "react";
import BracketSvg from "@/components/BracketSvg";

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

type Segment = {
  baseRoundNo: number;
  segmentStart: number;
  segmentEnd: number;
  matches: BracketMatch[];
};

type Props = {
  tournamentName: string;
  pageTitle: string;
  pageNo: number;
  totalPages: number;
  segments: Segment[];
  entryLabelMap: Record<string, string>;
  placeholderLabelMap?: Record<string, string>;
};

export default function BracketPrintSheet({
  tournamentName,
  pageTitle,
  pageNo,
  totalPages,
  segments,
  entryLabelMap,
  placeholderLabelMap,
}: Props) {
  const isTwoColumn = segments.length === 2;

  return (
    <section className="print-sheet">
      <div className="print-sheet-inner">
        <div className="print-sheet-tournament">{tournamentName || "-"}</div>

        <div className="print-sheet-title">
          {pageTitle}
          {totalPages > 1 ? `（${pageNo}/${totalPages}）` : ""}
        </div>

        <div
          className="print-sheet-grid"
          style={{
            gridTemplateColumns: isTwoColumn ? "1fr 1fr" : "1fr",
          }}
        >
          {segments.map((segment) => (
            <div
              key={`${pageNo}-${segment.segmentStart}`}
              className="print-sheet-panel"
            >
              <BracketSvg
                title={pageTitle}
                segmentTitle={`${segment.segmentStart}〜${segment.segmentEnd}枠`}
                matches={segment.matches}
                baseRoundNo={segment.baseRoundNo}
                segmentStart={segment.segmentStart}
                entryLabelMap={entryLabelMap}
                placeholderLabelMap={placeholderLabelMap}
                fit="responsive"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
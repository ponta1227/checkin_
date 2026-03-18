import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBracketPages } from "@/lib/brackets/paginate";
import BracketPrintSheet from "@/components/BracketPrintSheet";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

type BracketMatch = {
  id: string;
  bracket_id: string;
  round_no: number;
  match_no: number;
  status: string | null;
  table_no: string | null;
  score_text: string | null;
  game_scores: Array<{ p1: number | null; p2: number | null }> | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  next_match_id?: string | null;
  next_slot?: number | null;
};

export default async function PrintBracketPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("id", divisionId)
    .single();

  const { data: entriesData } = await supabase
    .from("entries")
    .select(`
      id,
      players (
        id,
        name,
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  const entryLabelMap: Record<string, string> = {};
  for (const entry of entriesData ?? []) {
    const name = entry.players?.name ?? "-";
    const affiliation = entry.players?.affiliation
      ? `（${entry.players.affiliation}）`
      : "";
    entryLabelMap[entry.id] = `${name}${affiliation}`;
  }

  const { data: bracket } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId)
    .eq("bracket_type", "main")
    .maybeSingle();

  let matches: BracketMatch[] = [];
  if (bracket?.id) {
    const { data: fetchedMatches } = await supabase
      .from("matches")
      .select(`
        id,
        bracket_id,
        round_no,
        match_no,
        status,
        table_no,
        score_text,
        game_scores,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        next_match_id,
        next_slot
      `)
      .eq("bracket_id", bracket.id)
      .neq("status", "skipped")
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    matches = (fetchedMatches ?? []) as BracketMatch[];
  }

  const pages = buildBracketPages(matches, 16, 2);

  return (
    <main className="print-root">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }

        html, body {
          margin: 0;
          padding: 0;
        }

        .print-root {
          padding: 16px;
        }

        .print-sheet {
          width: 100%;
          box-sizing: border-box;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .print-sheet-inner {
          width: 100%;
          height: 281mm;
          box-sizing: border-box;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: column;
        }

        .print-sheet-tournament {
          font-size: 12px;
          margin-bottom: 3mm;
          flex: 0 0 auto;
        }

        .print-sheet-title {
          font-weight: 700;
          font-size: 18px;
          text-align: center;
          border: 2px solid #222;
          background: #d9e8e8;
          padding: 6px 10px;
          margin-bottom: 4mm;
          box-sizing: border-box;
          flex: 0 0 auto;
        }

        .print-sheet-grid {
          display: grid;
          gap: 4mm;
          align-items: stretch;
          flex: 1 1 auto;
          min-height: 0;
        }

        .print-sheet-panel {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 3mm;
          box-sizing: border-box;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          background: white;
        }

        @media screen {
          .print-root {
            max-width: 210mm;
            margin: 0 auto;
          }

          .print-sheet {
            border: 1px solid #ddd;
            margin-bottom: 16px;
            padding: 8px;
            background: #fafafa;
          }

          .print-sheet-inner {
            height: 281mm;
          }
        }

        @media print {
          .print-root {
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-sheet {
            margin: 0;
            padding: 0;
            border: none;
            page-break-after: always;
            break-after: page;
          }

          .print-sheet:last-of-type {
            page-break-after: auto;
            break-after: auto;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: "20px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print`}>
          ← 印刷用ページ一覧へ戻る
        </Link>
      </div>

      {!bracket ? (
        <p>まだトーナメントは生成されていません。</p>
      ) : pages.length === 0 ? (
        <p>表示できるトーナメント試合がありません。</p>
      ) : (
        <>
          {pages.map((page) => (
            <BracketPrintSheet
              key={page.pageNo}
              tournamentName={tournament?.name ?? "-"}
              pageTitle={`${division?.name ?? "-"} トーナメント表`}
              pageNo={page.pageNo}
              totalPages={pages.length}
              segments={page.segments}
              entryLabelMap={entryLabelMap}
            />
          ))}
        </>
      )}
    </main>
  );
}
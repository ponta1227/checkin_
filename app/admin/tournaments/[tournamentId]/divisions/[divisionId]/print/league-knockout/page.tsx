import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDivisionFormat } from "@/lib/divisions/format";
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
  source_group_id_1?: string | null;
  source_rank_1?: number | null;
  source_group_id_2?: string | null;
  source_rank_2?: number | null;
};

function getBracketTitle(bracketType: string) {
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType;
}

export default async function PrintLeagueKnockoutPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format")
    .eq("id", divisionId)
    .single();

  if (!division || normalizeDivisionFormat(division.format) !== "league_then_knockout") {
    return (
      <main className="print-root">
        <style>{`
          .print-root { padding: 16px; }
        `}</style>

        <div className="no-print" style={{ marginBottom: "20px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print`}>
            ← 印刷用ページ一覧へ戻る
          </Link>
        </div>
        <p>この種目はリーグ→トーナメント形式ではありません。</p>
      </main>
    );
  }

  const { data: groupsData } = await supabase
    .from("league_groups")
    .select("id, group_no, name")
    .eq("division_id", divisionId)
    .order("group_no", { ascending: true });

  const groups = groupsData ?? [];
  const groupIds = groups.map((g) => g.id);

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

  const placeholderLabelMap: Record<string, string> = {};

  if (groupIds.length > 0) {
    const { data: membersData } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", groupIds)
      .order("slot_no", { ascending: true });

    const memberCountByGroup = new Map<string, number>();
    for (const member of membersData ?? []) {
      memberCountByGroup.set(
        member.group_id,
        (memberCountByGroup.get(member.group_id) ?? 0) + 1
      );
    }

    for (const group of groups) {
      const count = memberCountByGroup.get(group.id) ?? 0;
      for (let rank = 1; rank <= count; rank += 1) {
        placeholderLabelMap[`${group.id}:${rank}`] = `${group.group_no}リーグ${rank}位`;
      }
    }
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  const targetBrackets = [...(brackets ?? [])]
    .filter((b) => {
      const type = String(b.bracket_type ?? "");
      return type === "upper" || type === "lower" || /^rank_\\d+$/.test(type);
    })
    .sort((a, b) => {
      const aType = String(a.bracket_type);
      const bType = String(b.bracket_type);

      if (aType === "upper") return -1;
      if (bType === "upper") return 1;
      if (aType === "lower") return -1;
      if (bType === "lower") return 1;

      const aRank = Number(aType.replace("rank_", ""));
      const bRank = Number(bType.replace("rank_", ""));
      return aRank - bRank;
    });

  const bracketIds = targetBrackets.map((b) => b.id);

  let matches: BracketMatch[] = [];
  if (bracketIds.length > 0) {
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
        next_slot,
        source_group_id_1,
        source_rank_1,
        source_group_id_2,
        source_rank_2
      `)
      .in("bracket_id", bracketIds)
      .neq("status", "skipped")
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    matches = (fetchedMatches ?? []) as BracketMatch[];
  }

  const matchesByBracket = new Map<string, BracketMatch[]>();
  for (const match of matches) {
    if (!matchesByBracket.has(match.bracket_id)) {
      matchesByBracket.set(match.bracket_id, []);
    }
    matchesByBracket.get(match.bracket_id)!.push(match);
  }

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
          fontSize: 18px;
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

      {targetBrackets.length === 0 ? (
        <p>順位別トーナメントはまだ生成されていません。</p>
      ) : (
        <>
          {targetBrackets.map((bracket) => {
            const bracketMatches = matchesByBracket.get(bracket.id) ?? [];
            const pages = buildBracketPages(bracketMatches, 16, 2);

            if (pages.length === 0) return null;

            return pages.map((page) => (
              <BracketPrintSheet
                key={`${bracket.id}-${page.pageNo}`}
                tournamentName={tournament?.name ?? "-"}
                pageTitle={`${division?.name ?? "-"} ${getBracketTitle(String(bracket.bracket_type))}`}
                pageNo={page.pageNo}
                totalPages={pages.length}
                segments={page.segments}
                entryLabelMap={entryLabelMap}
                placeholderLabelMap={placeholderLabelMap}
              />
            ));
          })}
        </>
      )}
    </main>
  );
}
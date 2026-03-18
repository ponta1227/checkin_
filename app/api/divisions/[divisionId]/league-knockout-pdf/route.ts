import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDivisionFormat } from "@/lib/divisions/format";
import { pdf } from "@react-pdf/renderer";
import {
  LeagueKnockoutPdfDocument,
  type PdfBracketMatch,
} from "@/lib/brackets/leagueKnockoutPdfDocument";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ divisionId: string }> }
) {
  const { divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format, tournament_id")
    .eq("id", divisionId)
    .single();

  if (!division || normalizeDivisionFormat(division.format) !== "league_then_knockout") {
    return new NextResponse("この種目はリーグ→トーナメント形式ではありません。", {
      status: 400,
    });
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", division.tournament_id)
    .single();

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
      return type === "upper" || type === "lower" || /^rank_\d+$/.test(type);
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

  let matches: PdfBracketMatch[] = [];
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
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        source_group_id_1,
        source_rank_1,
        source_group_id_2,
        source_rank_2
      `)
      .in("bracket_id", bracketIds)
      .neq("status", "skipped")
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    matches = (fetchedMatches ?? []) as PdfBracketMatch[];
  }

  const matchesByBracket = new Map<string, PdfBracketMatch[]>();
  for (const match of matches) {
    if (!matchesByBracket.has(match.bracket_id)) {
      matchesByBracket.set(match.bracket_id, []);
    }
    matchesByBracket.get(match.bracket_id)!.push(match);
  }

  const doc = LeagueKnockoutPdfDocument({
    tournamentName: tournament?.name ?? "-",
    divisionName: division.name,
    targetBrackets: targetBrackets.map((b) => ({
      id: b.id,
      bracket_type: String(b.bracket_type),
    })),
    matchesByBracket,
    entryLabelMap,
    placeholderLabelMap,
  });

  const buffer = await pdf(doc).toBuffer();

  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        `${division.name}_順位別トーナメント表.pdf`
      )}`,
    },
  });
}
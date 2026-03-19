import { NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDivisionFormat } from "@/lib/divisions/format";
import {
  LeagueKnockoutPdfDocument,
  type PdfBracketMatch,
} from "@/lib/brackets/leagueKnockoutPdfDocument";

export const runtime = "nodejs";

type EntryPlayerRow = {
  id: string;
  name: string | null;
  affiliation: string | null;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
  players: EntryPlayerRow[] | null;
};

function buildEntryLabel(entry: EntryRow): string {
  if (entry.entry_name && entry.entry_name.trim() !== "") {
    return entry.entry_name;
  }

  if (!Array.isArray(entry.players) || entry.players.length === 0) {
    return "-";
  }

  const labels = entry.players
    .map((player) => {
      const name = player.name?.trim() || "-";
      const affiliation =
        player.affiliation && player.affiliation.trim() !== ""
          ? `（${player.affiliation}）`
          : "";
      return `${name}${affiliation}`;
    })
    .filter((label) => label.trim() !== "");

  return labels.length > 0 ? labels.join(" / ") : "-";
}

async function readNodeStreamToBuffer(
  stream: NodeJS.ReadableStream
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const uint8 = new Uint8Array(buffer);
  return uint8.buffer.slice(
    uint8.byteOffset,
    uint8.byteOffset + uint8.byteLength
  ) as ArrayBuffer;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ divisionId: string }> }
) {
  const { divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format, tournament_id")
    .eq("id", divisionId)
    .single();

  const divisionFormat = String(normalizeDivisionFormat(division?.format) ?? "");

  if (!division || divisionFormat !== "league_then_knockout") {
    return new NextResponse(
      "この種目はリーグ→トーナメント形式ではありません。",
      {
        status: 400,
      }
    );
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
  const groupIds = groups.map((g) => String(g.id));

  const { data: entriesData } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      players (
        id,
        name,
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  const entryLabelMap: Record<string, string> = {};
  for (const entry of (entriesData ?? []) as EntryRow[]) {
    entryLabelMap[String(entry.id)] = buildEntryLabel(entry);
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
      const groupId = String(member.group_id);
      memberCountByGroup.set(
        groupId,
        (memberCountByGroup.get(groupId) ?? 0) + 1
      );
    }

    for (const group of groups) {
      const groupId = String(group.id);
      const count = memberCountByGroup.get(groupId) ?? 0;
      for (let rank = 1; rank <= count; rank += 1) {
        placeholderLabelMap[`${groupId}:${rank}`] =
          `${group.group_no}リーグ${rank}位`;
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
      const aType = String(a.bracket_type ?? "");
      const bType = String(b.bracket_type ?? "");

      if (aType === "upper" && bType !== "upper") return -1;
      if (aType !== "upper" && bType === "upper") return 1;
      if (aType === "lower" && bType !== "lower") return -1;
      if (aType !== "lower" && bType === "lower") return 1;

      const aRank = Number(aType.replace("rank_", ""));
      const bRank = Number(bType.replace("rank_", ""));
      return aRank - bRank;
    });

  const bracketIds = targetBrackets.map((b) => String(b.id));

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
    const bracketId = String(match.bracket_id);
    if (!matchesByBracket.has(bracketId)) {
      matchesByBracket.set(bracketId, []);
    }
    matchesByBracket.get(bracketId)!.push(match);
  }

  const doc = LeagueKnockoutPdfDocument({
    tournamentName: tournament?.name ?? "-",
    divisionName: division.name ?? "-",
    targetBrackets: targetBrackets.map((b) => ({
      id: String(b.id),
      bracket_type: String(b.bracket_type ?? ""),
    })),
    matchesByBracket,
    entryLabelMap,
    placeholderLabelMap,
  });

  const stream = await renderToStream(doc);
  const pdfBuffer = await readNodeStreamToBuffer(stream);
  const pdfArrayBuffer = bufferToArrayBuffer(pdfBuffer);

  return new NextResponse(pdfArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        `${division.name ?? "順位別トーナメント"}_順位別トーナメント表.pdf`
      )}`,
    },
  });
}
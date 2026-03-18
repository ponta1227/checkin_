import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamBracketPrintBoard from "@/components/TeamBracketPrintBoard";
import { formatLeagueSourceLabel } from "@/lib/team/displaySources";


export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

function getBracketLabel(bracketType: string) {
  if (bracketType === "main") return "本戦";
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType || "トーナメント";
}

export default async function TeamBracketPrintPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, format, team_match_format")
    .eq("id", divisionId)
    .single();

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  if (division.format !== "knockout" && division.format !== "league_then_knockout") {
    return (
      <main style={{ padding: "24px" }}>
        <p>この印刷ページは団体戦トーナメント用です。</p>
      </main>
    );
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  const bracketTypeMap = new Map<string, string>();
  for (const bracket of brackets ?? []) {
    bracketTypeMap.set(bracket.id, String(bracket.bracket_type ?? "main"));
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id,
      bracket_id,
      round_no,
      match_no,
      player1_entry_id,
      player2_entry_id,
      status,
      score_text,
      table_no
    `)
    .eq("division_id", divisionId)
    .not("bracket_id", "is", null)
    .neq("status", "skipped")
    .order("bracket_id", { ascending: true })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const entryIds = Array.from(
    new Set(
      (matches ?? [])
        .flatMap((m) => [m.player1_entry_id, m.player2_entry_id])
        .filter(Boolean)
    )
  ) as string[];

  const { data: entries } =
    entryIds.length > 0
      ? await supabase
          .from("entries")
          .select("id, entry_name")
          .in("id", entryIds)
      : { data: [] as any[] };

  const entryMap = new Map((entries ?? []).map((e) => [e.id, e.entry_name ?? "-"]));

  const normalizedMatches =
    (matches ?? []).map((match) => {
      const bracketType = match.bracket_id
        ? bracketTypeMap.get(match.bracket_id) ?? "main"
        : "main";

      return {
        matchId: match.id,
        bracketType,
        bracketLabel: getBracketLabel(bracketType),
        roundNo: match.round_no,
        matchNo: match.match_no,
        
team1Name: match.player1_entry_id
  ? entryMap.get(String(match.player1_entry_id))?.entry_name ?? "未定"
  : formatLeagueSourceLabel({
      sourceType: match.player1_source_type,
      groupNo: match.player1_source_group_no,
      rank: match.player1_source_rank,
    })
        team2Name: match.player2_entry_id
  ? entryMap.get(String(match.player2_entry_id))?.entry_name ?? "未定"
  : formatLeagueSourceLabel({
      sourceType: match.player2_source_type,
      groupNo: match.player2_source_group_no,
      rank: match.player2_source_rank,
    })
        scoreText: match.score_text,
        tableNo: match.table_no,
      };
    }) ?? [];

  return (
    <>
      <div className="no-print" style={{ padding: "16px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <TeamBracketPrintBoard
        tournamentName={tournament?.name ?? "-"}
        divisionName={division.name}
        teamMatchFormat={division.team_match_format ?? null}
        matches={normalizedMatches}
      />
    </>
  );
}
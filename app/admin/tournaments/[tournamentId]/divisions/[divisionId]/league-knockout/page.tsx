import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDivisionFormat } from "@/lib/divisions/format";
import TournamentBracketClient from "@/components/TournamentBracketClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

function getBracketTitle(bracketType: string) {
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType;
}

export default async function LeagueKnockoutPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format")
    .eq("id", divisionId)
    .single();

  if (!division || normalizeDivisionFormat(division.format) !== "league_then_knockout") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>この種目はリーグ→トーナメント形式ではありません。</p>
      </main>
    );
  }

  const { data: entriesData } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
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
    const teamName =
      entry.entry_name ??
      entry.players?.name ??
      "-";

    const affiliation =
      entry.entry_affiliation ??
      entry.players?.affiliation ??
      "";

    entryLabelMap[entry.id] = affiliation ? `${teamName}（${affiliation}）` : teamName;
  }

  const { data: groupsData } = await supabase
    .from("league_groups")
    .select("id, group_no, name")
    .eq("division_id", divisionId)
    .order("group_no", { ascending: true });

  const groups = groupsData ?? [];
  const groupIds = groups.map((g) => g.id);

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
        placeholderLabelMap[`${group.id}:${rank}`] = `${group.group_no}リーグの${rank}位`;
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

  const { data: matchesData } =
    bracketIds.length > 0
      ? await supabase
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
          .order("match_no", { ascending: true })
      : { data: [] as any[] };

  const matchesByBracket = new Map<string, any[]>();
  for (const match of matchesData ?? []) {
    if (!matchesByBracket.has(match.bracket_id)) {
      matchesByBracket.set(match.bracket_id, []);
    }
    matchesByBracket.get(match.bracket_id)!.push(match);
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1600px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
          style={topLinkStyle()}
        >
          種目管理へ
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/league`}
          style={topLinkStyle()}
        >
          予選リーグへ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>順位別トーナメント</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {division.name}
      </p>

      {targetBrackets.length === 0 ? (
        <p>順位別トーナメントはまだ生成されていません。</p>
      ) : (
        <div style={{ display: "grid", gap: "28px" }}>
          {targetBrackets.map((bracket) => (
            <section key={bracket.id} style={{ display: "grid", gap: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>
                {getBracketTitle(String(bracket.bracket_type))}
              </h2>

              <TournamentBracketClient
                tournamentId={tournamentId}
                divisionId={divisionId}
                bracketType={String(bracket.bracket_type)}
                title={getBracketTitle(String(bracket.bracket_type))}
                matches={matchesByBracket.get(bracket.id) ?? []}
                entryLabelMap={entryLabelMap}
                placeholderLabelMap={placeholderLabelMap}
              />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function topLinkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    color: "inherit",
    textDecoration: "none",
  };
}
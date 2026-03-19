import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";

type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_affiliation: string | null;
};

type MatchRow = {
  id: string;
  division_id: string;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  player1_source_type: string | null;
  player1_source_group_no: number | null;
  player1_source_rank: number | null;
  player2_source_type: string | null;
  player2_source_group_no: number | null;
  player2_source_rank: number | null;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string | null;
  league_group_no: number | null;
  bracket_id: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const divisionId = String(body.divisionId ?? "");

    if (!divisionId) {
      return new Response("divisionId が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: entries, error: entriesError } = await supabase
      .from("entries")
      .select("id, entry_name, entry_affiliation")
      .eq("division_id", divisionId);

    if (entriesError) {
      return new Response(`エントリー取得に失敗しました: ${entriesError.message}`, {
        status: 500,
      });
    }

    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select(`
        id,
        division_id,
        player1_entry_id,
        player2_entry_id,
        player1_source_type,
        player1_source_group_no,
        player1_source_rank,
        player2_source_type,
        player2_source_group_no,
        player2_source_rank,
        winner_entry_id,
        score_text,
        status,
        league_group_no,
        bracket_id
      `)
      .eq("division_id", divisionId)
      .neq("status", "skipped");

    if (matchesError) {
      return new Response(`試合取得に失敗しました: ${matchesError.message}`, {
        status: 500,
      });
    }

    const typedEntries = (entries ?? []) as EntryRow[];
    const typedMatches = (matches ?? []) as MatchRow[];

    const leagueMatches = typedMatches.filter((m) => !m.bracket_id);

    const groupedStandings = buildTeamLeagueStandingsByGroup({
      entries: typedEntries.map((e) => ({
        id: e.id,
        entry_name: e.entry_name,
        entry_affiliation: e.entry_affiliation,
      })),
      matches: leagueMatches.map((m) => ({
        id: m.id,
        player1_entry_id: m.player1_entry_id,
        player2_entry_id: m.player2_entry_id,
        winner_entry_id: m.winner_entry_id,
        score_text: m.score_text,
        status: m.status,
        league_group_no: m.league_group_no,
      })),
    });

    const rankMap = new Map<string, string>();
    for (const group of groupedStandings) {
      for (const row of group.standings) {
        rankMap.set(`${group.groupNo}-${row.rank}`, row.entryId);
      }
    }

    const targetMatches = typedMatches.filter((m) => !!m.bracket_id);

    let updatedCount = 0;

    for (const match of targetMatches) {
      const patch: {
        player1_entry_id?: string | null;
        player2_entry_id?: string | null;
      } = {};

      if (!match.player1_entry_id && match.player1_source_type === "league_rank") {
        const key = `${match.player1_source_group_no}-${match.player1_source_rank}`;
        patch.player1_entry_id = rankMap.get(key) ?? null;
      }

      if (!match.player2_entry_id && match.player2_source_type === "league_rank") {
        const key = `${match.player2_source_group_no}-${match.player2_source_rank}`;
        patch.player2_entry_id = rankMap.get(key) ?? null;
      }

      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabase
          .from("matches")
          .update(patch)
          .eq("id", match.id);

        if (updateError) {
          return new Response(`試合更新に失敗しました: ${updateError.message}`, {
            status: 500,
          });
        }

        updatedCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      updatedCount,
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "順位反映に失敗しました。",
      { status: 500 }
    );
  }
}
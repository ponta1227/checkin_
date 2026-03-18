import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function countTeamScore(results: any[]) {
  let left = 0;
  let right = 0;
  for (const row of results) {
    if (row.winnerSide === "team1") left += 1;
    if (row.winnerSide === "team2") right += 1;
  }
  return { left, right };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const divisionId = String(body.divisionId ?? "");
    const matchId = String(body.matchId ?? "");
    const results = Array.isArray(body.results) ? body.results : [];
    const finalize = Boolean(body.finalize);

    if (!divisionId || !matchId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    await supabase.from("team_match_games").delete().eq("team_match_id", matchId);

    const gameRows = results
      .filter((row: any) => row.winnerSide)
      .map((row: any) => ({
        team_match_id: matchId,
        board_no: Number(row.boardNo),
        winner_side: row.winnerSide,
        score_text: `${row.leftGames}-${row.rightGames}`,
        status: "completed",
      }));

    if (gameRows.length > 0) {
      await supabase.from("team_match_games").insert(gameRows);
    }

    if (finalize) {
      const { left, right } = countTeamScore(results);
      const { data: match } = await supabase
        .from("matches")
        .select("id, player1_entry_id, player2_entry_id")
        .eq("id", matchId)
        .eq("division_id", divisionId)
        .single();

      if (!match) {
        return new Response("試合が見つかりません。", { status: 404 });
      }

      let winnerEntryId = null;
      if (left > right) winnerEntryId = match.player1_entry_id;
      if (right > left) winnerEntryId = match.player2_entry_id;

      await supabase
        .from("matches")
        .update({
          score_text: `${left}-${right}`,
          winner_entry_id: winnerEntryId,
          status: "completed",
        })
        .eq("id", matchId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "結果送信に失敗しました。",
      { status: 500 }
    );
  }
}
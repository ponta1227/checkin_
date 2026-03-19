import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LeagueMatchRow = {
  id: string;
  player1_entry_id: string;
  player2_entry_id: string;
};

function parseScore(scoreText: string) {
  const trimmed = scoreText.trim();
  if (!trimmed) return null;

  const nums = trimmed.match(/\d+/g);
  if (!nums || nums.length < 2) return null;

  const p1 = Number(nums[0]);
  const p2 = Number(nums[1]);

  if (Number.isNaN(p1) || Number.isNaN(p2)) return null;

  return { p1, p2 };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const leagueMatchId = formData.get("leagueMatchId")?.toString() ?? "";
    const winnerEntryId = formData.get("winnerEntryId")?.toString() ?? "";
    const scoreText = formData.get("scoreText")?.toString().trim() ?? "";

    if (!tournamentId || !divisionId || !leagueMatchId || !winnerEntryId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: matchData, error: matchError } = await supabase
      .from("league_matches")
      .select("id, player1_entry_id, player2_entry_id")
      .eq("id", leagueMatchId)
      .single();

    const match = matchData as LeagueMatchRow | null;

    if (matchError || !match) {
      return new Response(`リーグ試合取得に失敗しました: ${matchError?.message}`, {
        status: 500,
      });
    }

    const validWinner =
      winnerEntryId === match.player1_entry_id ||
      winnerEntryId === match.player2_entry_id;

    if (!validWinner) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?error=invalid_winner`,
          request.url
        )
      );
    }

    if (scoreText) {
      const parsed = parseScore(scoreText);

      if (!parsed) {
        return NextResponse.redirect(
          new URL(
            `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?error=invalid_score`,
            request.url
          )
        );
      }

      if (parsed.p1 === parsed.p2) {
        return NextResponse.redirect(
          new URL(
            `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?error=invalid_score`,
            request.url
          )
        );
      }

      if (
        winnerEntryId === match.player1_entry_id &&
        parsed.p1 < parsed.p2
      ) {
        return NextResponse.redirect(
          new URL(
            `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?error=score_mismatch`,
            request.url
          )
        );
      }

      if (
        winnerEntryId === match.player2_entry_id &&
        parsed.p2 < parsed.p1
      ) {
        return NextResponse.redirect(
          new URL(
            `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?error=score_mismatch`,
            request.url
          )
        );
      }
    }

    const { error: updateError } = await supabase
      .from("league_matches")
      .update({
        winner_entry_id: winnerEntryId,
        score_text: scoreText || null,
        status: "completed",
      })
      .eq("id", leagueMatchId);

    if (updateError) {
      return new Response(`リーグ試合結果保存に失敗しました: ${updateError.message}`, {
        status: 500,
      });
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results?saved=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ結果保存に失敗しました。";

    return new Response(message, {
      status: 500,
    });
  }
}
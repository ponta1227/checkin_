import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GameScore = {
  p1: number | null;
  p2: number | null;
};

function countGamesWon(scores: GameScore[]) {
  let p1Wins = 0;
  let p2Wins = 0;

  for (const row of scores) {
    if (row.p1 === null || row.p2 === null) continue;
    if (row.p1 > row.p2) p1Wins += 1;
    if (row.p2 > row.p1) p2Wins += 1;
  }

  return { p1Wins, p2Wins };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const matchId = formData.get("matchId")?.toString() ?? "";
    const winnerEntryId = formData.get("winnerEntryId")?.toString() ?? "";
    const player1Games = Number(formData.get("player1Games")?.toString() ?? "");
    const player2Games = Number(formData.get("player2Games")?.toString() ?? "");
    const gameScoresRaw = formData.get("gameScores")?.toString() ?? "";
    const clear = formData.get("clear")?.toString() ?? "";

    if (!tournamentId || !divisionId || !matchId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: match, error: matchError } = await supabase
      .from("league_matches")
      .select("id, group_id, player1_entry_id, player2_entry_id")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return new Response(`試合取得に失敗しました: ${matchError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    const { data: group, error: groupError } = await supabase
      .from("league_groups")
      .select("id, results_confirmed")
      .eq("id", match.group_id)
      .single();

    if (groupError || !group) {
      return new Response(`リーグ取得に失敗しました: ${groupError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    if (group.results_confirmed) {
      return new Response("このリーグはすでに結果報告済みのため、編集できません。", {
        status: 400,
      });
    }

    if (clear === "1") {
      const { error } = await supabase
        .from("league_matches")
        .update({
          winner_entry_id: null,
          score_text: null,
          game_scores: null,
          status: "ready",
        })
        .eq("id", matchId);

      if (error) {
        return new Response(`結果クリアに失敗しました: ${error.message}`, {
          status: 500,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (!winnerEntryId) {
      return new Response("勝者が選択されていません。", { status: 400 });
    }

    if (
      winnerEntryId !== match.player1_entry_id &&
      winnerEntryId !== match.player2_entry_id
    ) {
      return new Response("不正な勝者です。", { status: 400 });
    }

    if (
      !Number.isInteger(player1Games) ||
      !Number.isInteger(player2Games) ||
      player1Games < 0 ||
      player2Games < 0
    ) {
      return new Response("ゲーム数が不正です。", { status: 400 });
    }

    let gameScores: GameScore[] | null = null;

    if (gameScoresRaw) {
      try {
        gameScores = JSON.parse(gameScoresRaw) as GameScore[];
      } catch {
        return new Response("各ゲームの点数形式が不正です。", { status: 400 });
      }
    }

    if (!gameScores || !Array.isArray(gameScores)) {
      return new Response("各ゲームの点数が送信されていません。", { status: 400 });
    }

    const normalizedScores = gameScores.map((row) => ({
      p1:
        row?.p1 === null || row?.p1 === undefined || Number.isNaN(Number(row.p1))
          ? null
          : Number(row.p1),
      p2:
        row?.p2 === null || row?.p2 === undefined || Number.isNaN(Number(row.p2))
          ? null
          : Number(row.p2),
    }));

    const counted = countGamesWon(normalizedScores);

    if (counted.p1Wins !== player1Games || counted.p2Wins !== player2Games) {
      return new Response("各ゲームの点数から集計したゲーム数と入力されたゲーム数が一致しません。", {
        status: 400,
      });
    }

    if (player1Games === player2Games) {
      return new Response("ゲーム数が同点です。", { status: 400 });
    }

    const expectedWinner =
      player1Games > player2Games ? match.player1_entry_id : match.player2_entry_id;

    if (winnerEntryId !== expectedWinner) {
      return new Response("勝者とゲーム数が一致していません。", { status: 400 });
    }

    const scoreText = `${player1Games}-${player2Games}`;

    const { error } = await supabase
      .from("league_matches")
      .update({
        winner_entry_id: winnerEntryId,
        score_text: scoreText,
        game_scores: normalizedScores,
        status: "completed",
      })
      .eq("id", matchId);

    if (error) {
      return new Response(`結果保存に失敗しました: ${error.message}`, {
        status: 500,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ結果保存に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function advanceWinner(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  matchId: string,
  winnerEntryId: string
) {
  const { data: currentMatch } = await supabase
    .from("matches")
    .select("next_match_id, next_slot")
    .eq("id", matchId)
    .single();

  if (!currentMatch?.next_match_id || !currentMatch?.next_slot) return;

  const updateData =
    currentMatch.next_slot === 1
      ? { player1_entry_id: winnerEntryId }
      : { player2_entry_id: winnerEntryId };

  await supabase
    .from("matches")
    .update(updateData)
    .eq("id", currentMatch.next_match_id);
}

async function applyWalkovers(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  bracketId: string
) {
  let changed = true;

  while (changed) {
    changed = false;

    const { data: matches } = await supabase
      .from("matches")
      .select("id, player1_entry_id, player2_entry_id, winner_entry_id, status")
      .eq("bracket_id", bracketId)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    for (const match of matches ?? []) {
      const p1 = match.player1_entry_id;
      const p2 = match.player2_entry_id;
      const winner = match.winner_entry_id;

      if (!winner && p1 && !p2) {
        await supabase
          .from("matches")
          .update({
            winner_entry_id: p1,
            status: "walkover",
            score_text: null,
            game_scores: null,
          })
          .eq("id", match.id);

        await advanceWinner(supabase, match.id, p1);
        changed = true;
      } else if (!winner && !p1 && p2) {
        await supabase
          .from("matches")
          .update({
            winner_entry_id: p2,
            status: "walkover",
            score_text: null,
            game_scores: null,
          })
          .eq("id", match.id);

        await advanceWinner(supabase, match.id, p2);
        changed = true;
      } else if (!winner && p1 && p2 && match.status !== "ready" && match.status !== "in_progress") {
        await supabase
          .from("matches")
          .update({
            status: "ready",
            score_text: null,
          })
          .eq("id", match.id);

        changed = true;
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const matchId = formData.get("matchId")?.toString() ?? "";
    const action = formData.get("action")?.toString() ?? "";
    const tableNo = formData.get("tableNo")?.toString() ?? "";
    const winnerEntryId = formData.get("winnerEntryId")?.toString() ?? "";
    const scoreText = formData.get("scoreText")?.toString() ?? "";
    const gameScoresRaw = formData.get("gameScores")?.toString() ?? "";

    if (!matchId || !action) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select(`
        id,
        bracket_id,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        status
      `)
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return new Response(`試合取得に失敗しました: ${matchError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    if (action === "start") {
      if (!match.player1_entry_id || !match.player2_entry_id) {
        return new Response("対戦相手が未確定のため開始できません。", { status: 400 });
      }

      if (!tableNo.trim()) {
        return new Response("台番号を入力してください。", { status: 400 });
      }

      const { error } = await supabase
        .from("matches")
        .update({
          table_no: tableNo,
          status: "in_progress",
        })
        .eq("id", matchId);

      if (error) {
        return new Response(`試合開始更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "complete") {
      if (!match.player1_entry_id || !match.player2_entry_id) {
        return new Response("対戦相手が未確定のため確定できません。", { status: 400 });
      }

      if (
        winnerEntryId !== match.player1_entry_id &&
        winnerEntryId !== match.player2_entry_id
      ) {
        return new Response("不正な勝者です。", { status: 400 });
      }

      let gameScores: Array<{ p1: number | null; p2: number | null }> | null = null;

      if (gameScoresRaw) {
        try {
          gameScores = JSON.parse(gameScoresRaw);
        } catch {
          return new Response("ゲームスコア形式が不正です。", { status: 400 });
        }
      }

      const { error } = await supabase
        .from("matches")
        .update({
          winner_entry_id: winnerEntryId,
          score_text: scoreText || null,
          game_scores: gameScores,
          status: "completed",
          table_no: tableNo || null,
        })
        .eq("id", matchId);

      if (error) {
        return new Response(`試合結果更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }

      await advanceWinner(supabase, matchId, winnerEntryId);
      await applyWalkovers(supabase, match.bracket_id);

      return NextResponse.json({ ok: true });
    }

    if (action === "forfeit") {
      if (
        winnerEntryId !== match.player1_entry_id &&
        winnerEntryId !== match.player2_entry_id
      ) {
        return new Response("不正な勝者です。", { status: 400 });
      }

      const { error } = await supabase
        .from("matches")
        .update({
          winner_entry_id: winnerEntryId,
          score_text: "棄権",
          game_scores: null,
          status: "completed",
          table_no: tableNo || null,
        })
        .eq("id", matchId);

      if (error) {
        return new Response(`棄権処理に失敗しました: ${error.message}`, {
          status: 500,
        });
      }

      await advanceWinner(supabase, matchId, winnerEntryId);
      await applyWalkovers(supabase, match.bracket_id);

      return NextResponse.json({ ok: true });
    }

    return new Response("不正な action です。", { status: 400 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "試合更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
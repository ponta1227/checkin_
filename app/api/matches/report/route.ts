import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClientLike = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type MatchRow = {
  id: string;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  next_match_id: string | null;
  next_slot: number | null;
  winner_entry_id: string | null;
  status: string | null;
};

type EntryRow = {
  id: string;
  player_id: string | null;
};

type PlayerRow = {
  id: string;
  rating: number | null;
};

type RatingHistoryRow = {
  id: string;
  player_id: string;
  delta: number;
};

function calculateWinnerDelta(
  winnerRating: number,
  loserRating: number,
  k = 32
) {
  const expectedWinner =
    1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.round(k * (1 - expectedWinner));
}

async function updateNextMatchStatus(
  supabase: SupabaseClientLike,
  nextMatchId: string
) {
  const { data: nextMatch, error } = await supabase
    .from("matches")
    .select("id, player1_entry_id, player2_entry_id, winner_entry_id, status")
    .eq("id", nextMatchId)
    .single();

  if (error || !nextMatch) return;
  if (nextMatch.winner_entry_id) return;

  if (nextMatch.player1_entry_id && nextMatch.player2_entry_id) {
    await supabase
      .from("matches")
      .update({ status: "ready" })
      .eq("id", nextMatchId);
  }
}

async function revertExistingRatingHistory(
  supabase: SupabaseClientLike,
  matchId: string
) {
  const { data: historyRowsData, error: historyError } = await supabase
    .from("rating_history")
    .select("id, player_id, delta")
    .eq("match_id", matchId);

  if (historyError) {
    throw new Error(
      `既存レーティング履歴の取得に失敗しました: ${historyError.message}`
    );
  }

  const historyRows = (historyRowsData ?? []) as RatingHistoryRow[];

  if (historyRows.length === 0) return;

  const playerIds = [...new Set(historyRows.map((row) => row.player_id))];

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, rating")
    .in("id", playerIds);

  if (playersError) {
    throw new Error(
      `既存レーティング戻し用の選手取得に失敗しました: ${playersError.message}`
    );
  }

  const players = (playersData ?? []) as PlayerRow[];
  const playerMap = new Map<string, PlayerRow>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }

  for (const row of historyRows) {
    const player = playerMap.get(row.player_id);
    const currentRating = player?.rating ?? 1500;
    const revertedRating = currentRating - row.delta;

    const { error: updateError } = await supabase
      .from("players")
      .update({ rating: revertedRating })
      .eq("id", row.player_id);

    if (updateError) {
      throw new Error(
        `既存レーティングの戻しに失敗しました: ${updateError.message}`
      );
    }
  }

  const historyIds = historyRows.map((row) => row.id);

  const { error: deleteError } = await supabase
    .from("rating_history")
    .delete()
    .in("id", historyIds);

  if (deleteError) {
    throw new Error(
      `既存レーティング履歴の削除に失敗しました: ${deleteError.message}`
    );
  }
}

async function applyRatingForMatch(params: {
  supabase: SupabaseClientLike;
  matchId: string;
  tournamentId: string;
  divisionId: string;
  player1EntryId: string;
  player2EntryId: string;
  winnerEntryId: string;
}) {
  const {
    supabase,
    matchId,
    tournamentId,
    divisionId,
    player1EntryId,
    player2EntryId,
    winnerEntryId,
  } = params;

  await revertExistingRatingHistory(supabase, matchId);

  const { data: entriesData, error: entriesError } = await supabase
    .from("entries")
    .select("id, player_id")
    .in("id", [player1EntryId, player2EntryId]);

  if (entriesError) {
    throw new Error(`参加者情報の取得に失敗しました: ${entriesError.message}`);
  }

  const entries = (entriesData ?? []) as EntryRow[];
  const entryMap = new Map<string, string | null>();
  for (const entry of entries) {
    entryMap.set(entry.id, entry.player_id);
  }

  const player1Id = entryMap.get(player1EntryId) ?? null;
  const player2Id = entryMap.get(player2EntryId) ?? null;

  if (!player1Id || !player2Id) {
    throw new Error("参加登録に対応する選手IDが見つかりませんでした。");
  }

  const winnerPlayerId =
    winnerEntryId === player1EntryId ? player1Id : player2Id;
  const loserPlayerId =
    winnerEntryId === player1EntryId ? player2Id : player1Id;

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, rating")
    .in("id", [winnerPlayerId, loserPlayerId]);

  if (playersError) {
    throw new Error(`選手レーティングの取得に失敗しました: ${playersError.message}`);
  }

  const players = (playersData ?? []) as PlayerRow[];
  const playerMap = new Map<string, PlayerRow>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }

  const winnerBefore = playerMap.get(winnerPlayerId)?.rating ?? 1500;
  const loserBefore = playerMap.get(loserPlayerId)?.rating ?? 1500;

  const winnerDelta = calculateWinnerDelta(winnerBefore, loserBefore, 32);
  const loserDelta = -winnerDelta;

  const winnerAfter = winnerBefore + winnerDelta;
  const loserAfter = loserBefore + loserDelta;

  const { error: updateWinnerError } = await supabase
    .from("players")
    .update({ rating: winnerAfter })
    .eq("id", winnerPlayerId);

  if (updateWinnerError) {
    throw new Error(
      `勝者レーティング更新に失敗しました: ${updateWinnerError.message}`
    );
  }

  const { error: updateLoserError } = await supabase
    .from("players")
    .update({ rating: loserAfter })
    .eq("id", loserPlayerId);

  if (updateLoserError) {
    throw new Error(
      `敗者レーティング更新に失敗しました: ${updateLoserError.message}`
    );
  }

  const { error: historyInsertError } = await supabase
    .from("rating_history")
    .insert([
      {
        match_id: matchId,
        tournament_id: tournamentId,
        division_id: divisionId,
        player_id: winnerPlayerId,
        opponent_player_id: loserPlayerId,
        result: "win",
        before_rating: winnerBefore,
        after_rating: winnerAfter,
        delta: winnerDelta,
      },
      {
        match_id: matchId,
        tournament_id: tournamentId,
        division_id: divisionId,
        player_id: loserPlayerId,
        opponent_player_id: winnerPlayerId,
        result: "loss",
        before_rating: loserBefore,
        after_rating: loserAfter,
        delta: loserDelta,
      },
    ]);

  if (historyInsertError) {
    throw new Error(
      `レーティング履歴保存に失敗しました: ${historyInsertError.message}`
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const matchId = formData.get("matchId")?.toString() ?? "";
    const winnerEntryId = formData.get("winnerEntryId")?.toString() ?? "";
    const scoreText = formData.get("scoreText")?.toString().trim() ?? "";

    if (!tournamentId || !divisionId || !matchId || !winnerEntryId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select(
        "id, player1_entry_id, player2_entry_id, next_match_id, next_slot, winner_entry_id, status"
      )
      .eq("id", matchId)
      .single();

    const match = matchData as MatchRow | null;

    if (matchError || !match) {
      return new Response(`試合取得に失敗しました: ${matchError?.message}`, {
        status: 500,
      });
    }

    const validWinner =
      winnerEntryId === match.player1_entry_id ||
      winnerEntryId === match.player2_entry_id;

    if (!validWinner) {
      return new Response("勝者が対戦者に含まれていません。", { status: 400 });
    }

    const { error: updateMatchError } = await supabase
      .from("matches")
      .update({
        winner_entry_id: winnerEntryId,
        score_text: scoreText || null,
        status: "completed",
      })
      .eq("id", matchId);

    if (updateMatchError) {
      return new Response(
        `試合結果保存に失敗しました: ${updateMatchError.message}`,
        {
          status: 500,
        }
      );
    }

    if (match.player1_entry_id && match.player2_entry_id) {
      await applyRatingForMatch({
        supabase,
        matchId,
        tournamentId,
        divisionId,
        player1EntryId: match.player1_entry_id,
        player2EntryId: match.player2_entry_id,
        winnerEntryId,
      });
    }

    if (match.next_match_id && match.next_slot) {
      const updateData =
        match.next_slot === 1
          ? { player1_entry_id: winnerEntryId }
          : { player2_entry_id: winnerEntryId };

      const { error: nextMatchUpdateError } = await supabase
        .from("matches")
        .update(updateData)
        .eq("id", match.next_match_id);

      if (nextMatchUpdateError) {
        return new Response(
          `次試合への勝者反映に失敗しました: ${nextMatchUpdateError.message}`,
          { status: 500 }
        );
      }

      await updateNextMatchStatus(supabase, match.next_match_id);
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/results?saved=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "結果保存に失敗しました。";

    return new Response(message, {
      status: 500,
    });
  }
}
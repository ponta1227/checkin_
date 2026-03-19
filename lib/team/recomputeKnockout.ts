import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

type MatchNode = {
  id: string;
  next_match_id: string | null;
  next_slot: number | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  status: string | null;
  score_text: string | null;
};

type PrevMatch = {
  id: string;
  next_slot: number | null;
  winner_entry_id: string | null;
  status: string | null;
};

function isRealCompletedMatch(match: {
  status: string | null;
  score_text: string | null;
  winner_entry_id: string | null;
}) {
  return (
    match.status === "completed" &&
    !!match.winner_entry_id &&
    match.score_text !== "BYE"
  );
}

async function recomputeMatchFromPredecessors(
  supabase: SupabaseClient,
  matchId: string
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from("matches")
    .select(
      "id, next_match_id, next_slot, player1_entry_id, player2_entry_id, winner_entry_id, status, score_text"
    )
    .eq("id", matchId)
    .single<MatchNode>();

  if (currentError || !current) {
    throw new Error(
      `次戦取得に失敗しました: ${currentError?.message ?? "not found"}`
    );
  }

  const { data: prevMatches, error: prevError } = await supabase
    .from("matches")
    .select("id, next_slot, winner_entry_id, status")
    .eq("next_match_id", matchId)
    .returns<PrevMatch[]>();

  if (prevError) {
    throw new Error(`前試合取得に失敗しました: ${prevError.message}`);
  }

  const prevSlot1 = (prevMatches ?? []).find((m) => m.next_slot === 1) ?? null;
  const prevSlot2 = (prevMatches ?? []).find((m) => m.next_slot === 2) ?? null;

  const newPlayer1 =
    prevSlot1 && prevSlot1.status === "completed"
      ? prevSlot1.winner_entry_id ?? null
      : null;

  const newPlayer2 =
    prevSlot2 && prevSlot2.status === "completed"
      ? prevSlot2.winner_entry_id ?? null
      : null;

  const playersChanged =
    current.player1_entry_id !== newPlayer1 ||
    current.player2_entry_id !== newPlayer2;

  let nextStatus: string = current.status ?? "pending";
  let nextWinner: string | null = current.winner_entry_id ?? null;
  let nextScore: string | null = current.score_text ?? null;

  const bothReady = !!newPlayer1 && !!newPlayer2;

  // 参加者が変わったら、その試合結果は一旦クリア
  if (playersChanged) {
    nextStatus = "pending";
    nextWinner = null;
    nextScore = null;
  }

  // 片方でも未確定なら、その試合は未確定に戻す
  if (!bothReady) {
    nextStatus = "pending";
    nextWinner = null;
    nextScore = null;
  }

  // 以前 BYE で仮完了していて、今回両者が揃ったなら pending に戻す
  if (bothReady && current.score_text === "BYE") {
    nextStatus = "pending";
    nextWinner = null;
    nextScore = null;
  }

  // 既に実試合として完了済みで、参加者も変わっていないなら結果維持
  if (
    bothReady &&
    !playersChanged &&
    isRealCompletedMatch({
      status: current.status,
      score_text: current.score_text,
      winner_entry_id: current.winner_entry_id,
    })
  ) {
    nextStatus = current.status ?? "pending";
    nextWinner = current.winner_entry_id ?? null;
    nextScore = current.score_text ?? null;
  }

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      player1_entry_id: newPlayer1,
      player2_entry_id: newPlayer2,
      status: nextStatus,
      winner_entry_id: nextWinner,
      score_text: nextScore,
    })
    .eq("id", matchId);

  if (updateError) {
    throw new Error(`次戦更新に失敗しました: ${updateError.message}`);
  }

  if (current.next_match_id) {
    await recomputeMatchFromPredecessors(supabase, current.next_match_id);
  }
}

export async function recomputeDownstreamFromMatch(
  supabase: SupabaseClient,
  matchId: string
): Promise<void> {
  const { data: current, error } = await supabase
    .from("matches")
    .select("id, next_match_id")
    .eq("id", matchId)
    .single<{ id: string; next_match_id: string | null }>();

  if (error || !current) {
    throw new Error(
      `現在試合取得に失敗しました: ${error?.message ?? "not found"}`
    );
  }

  if (!current.next_match_id) return;

  await recomputeMatchFromPredecessors(supabase, current.next_match_id);
}
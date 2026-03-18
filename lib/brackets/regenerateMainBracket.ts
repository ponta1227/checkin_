import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

type EntryRow = {
  id: string;
  seed: number | null;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  players:
    | {
        id: string;
        name: string | null;
        rating: number | null;
        affiliation: string | null;
      }
    | null;
  checkins:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

function getCheckinStatus(entry: EntryRow) {
  const checkin = Array.isArray(entry.checkins) ? entry.checkins[0] : entry.checkins;
  return checkin?.status ?? null;
}

function sortEntries(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const drawA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const drawB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (drawA !== drawB) return drawA - drawB;

    const ratingA = a.entry_rating ?? a.players?.rating ?? Number.NEGATIVE_INFINITY;
    const ratingB = b.entry_rating ?? b.players?.rating ?? Number.NEGATIVE_INFINITY;
    if (ratingA !== ratingB) return ratingB - ratingA;

    return (a.players?.name ?? "").localeCompare(b.players?.name ?? "", "ja");
  });
}

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function generateSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  const prev = generateSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of prev) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

async function advanceWinner(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
          })
          .eq("id", match.id);

        await advanceWinner(supabase, match.id, p2);
        changed = true;
      } else if (!winner && p1 && p2 && match.status !== "ready") {
        await supabase
          .from("matches")
          .update({
            status: "ready",
            score_text: null,
          })
          .eq("id", match.id);

        changed = true;
      } else if (!winner && !p1 && !p2 && match.status !== "pending") {
        await supabase
          .from("matches")
          .update({
            status: "pending",
            score_text: null,
          })
          .eq("id", match.id);

        changed = true;
      }
    }
  }
}

export async function getBracketEligibleEntries(
  supabase: SupabaseClient,
  divisionId: string
) {
  const { data: entriesData, error } = await supabase
    .from("entries")
    .select(`
      id,
      seed,
      entry_rating,
      ranking_for_draw,
      players (
        id,
        name,
        rating,
        affiliation
      ),
      checkins (
        status
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  if (error) {
    throw new Error(`参加者取得に失敗しました: ${error.message}`);
  }

  const entries = (entriesData ?? []) as EntryRow[];

  const activeEntries = entries.filter((entry) => {
    const status = getCheckinStatus(entry);
    return status !== "withdrawn";
  });

  return sortEntries(activeEntries);
}

export async function regenerateMainBracket(
  supabase: SupabaseClient,
  divisionId: string
) {
  const activeEntries = await getBracketEligibleEntries(supabase, divisionId);

  if (activeEntries.length < 2) {
    return { ok: false, reason: "need_two_players" as const };
  }

  const { data: existingBracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId)
    .eq("bracket_type", "main")
    .maybeSingle();

  let bracketId = existingBracket?.id ?? null;

  if (!bracketId) {
   const { data: insertedBracket, error: insertBracketError } = await supabase
      .from("brackets")
      .insert({
        division_id: divisionId,
        bracket_type: "main",
      })
      .select("id")
      .single();

    if (insertBracketError || !insertedBracket) {
      throw new Error(`brackets追加失敗: ${insertBracketError?.message ?? "unknown"}`);
    }

    bracketId = insertedBracket.id;
  } else {
    const { data: existingMatches } = await supabase
      .from("matches")
      .select("id, status")
      .eq("bracket_id", bracketId);

    const hasCompleted = (existingMatches ?? []).some((m) => m.status === "completed");
    if (hasCompleted) {
      return { ok: false, reason: "has_completed_results" as const };
    }

    await supabase
      .from("matches")
      .delete()
      .eq("bracket_id", bracketId);
  }

  const bracketSize = nextPowerOfTwo(activeEntries.length);
  const totalRounds = Math.log2(bracketSize);

  const roundRows: Array<Array<{ id: string; match_no: number }>> = [];

  for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
    const numMatches = bracketSize / Math.pow(2, roundNo);

    const rows = Array.from({ length: numMatches }, (_, index) => ({
      bracket_id: bracketId,
      round_no: roundNo,
      match_no: index + 1,
      status: "pending",
    }));

    const { data: insertedMatches, error } = await supabase
      .from("matches")
      .insert(rows)
      .select("id, match_no");

    if (error) {
      throw new Error(`matches追加失敗: ${error.message}`);
    }

    roundRows.push(
      [...(insertedMatches ?? [])].sort((a, b) => a.match_no - b.match_no) as Array<{
        id: string;
        match_no: number;
      }>
    );
  }

  for (let roundIndex = 0; roundIndex < roundRows.length - 1; roundIndex += 1) {
    const currentRound = roundRows[roundIndex];
    const nextRound = roundRows[roundIndex + 1];

    for (let matchIndex = 0; matchIndex < currentRound.length; matchIndex += 1) {
      const currentMatch = currentRound[matchIndex];
      const nextMatch = nextRound[Math.floor(matchIndex / 2)];
      const nextSlot = matchIndex % 2 === 0 ? 1 : 2;

      await supabase
        .from("matches")
        .update({
          next_match_id: nextMatch.id,
          next_slot: nextSlot,
        })
        .eq("id", currentMatch.id);
    }
  }

  const seedOrder = generateSeedOrder(bracketSize);
  const slots = Array<string | null>(bracketSize).fill(null);

  for (let i = 0; i < activeEntries.length; i += 1) {
    const pos = seedOrder[i] - 1;
    slots[pos] = activeEntries[i].id;
  }

  const firstRound = roundRows[0];

  for (let i = 0; i < firstRound.length; i += 1) {
    const match = firstRound[i];
    const p1 = slots[i * 2] ?? null;
    const p2 = slots[i * 2 + 1] ?? null;

    await supabase
      .from("matches")
      .update({
        player1_entry_id: p1,
        player2_entry_id: p2,
        winner_entry_id: null,
        score_text: null,
        status: "pending",
      })
      .eq("id", match.id);
  }

  await applyWalkovers(supabase, bracketId);

  await supabase
    .from("brackets")
    .update({ status: "generated" })
    .eq("id", bracketId);

  return { ok: true as const, bracketId };
}
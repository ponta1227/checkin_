import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBracketEligibleEntries } from "@/lib/brackets/regenerateMainBracket";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type MatchRow = {
  id: string;
  round_no: number | null;
  match_no: number | null;
  next_match_id: string | null;
  next_slot: number | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  status: string | null;
};

async function advanceWinner(
  supabase: ServerSupabaseClient,
  matchId: string,
  winnerEntryId: string
) {
  const { data: currentMatch } = await supabase
    .from("matches")
    .select("next_match_id, next_slot")
    .eq("id", matchId)
    .single();

  if (!currentMatch?.next_match_id || !currentMatch?.next_slot) {
    return;
  }

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
  supabase: ServerSupabaseClient,
  bracketId: string
) {
  let changed = true;

  while (changed) {
    changed = false;

    const { data: matches, error } = await supabase
      .from("matches")
      .select("id, player1_entry_id, player2_entry_id, winner_entry_id, status")
      .eq("bracket_id", bracketId)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    if (error) {
      throw new Error(`試合取得に失敗しました: ${error.message}`);
    }

    for (const match of matches ?? []) {
      const p1 = match.player1_entry_id;
      const p2 = match.player2_entry_id;
      const winner = match.winner_entry_id;

      if (!winner && p1 && !p2) {
        const { error: updateError } = await supabase
          .from("matches")
          .update({
            winner_entry_id: p1,
            status: "walkover",
            score_text: null,
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`不戦勝更新に失敗しました: ${updateError.message}`);
        }

        await advanceWinner(supabase, match.id, p1);
        changed = true;
      } else if (!winner && !p1 && p2) {
        const { error: updateError } = await supabase
          .from("matches")
          .update({
            winner_entry_id: p2,
            status: "walkover",
            score_text: null,
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`不戦勝更新に失敗しました: ${updateError.message}`);
        }

        await advanceWinner(supabase, match.id, p2);
        changed = true;
      } else if (!winner && p1 && p2 && match.status !== "ready") {
        const { error: updateError } = await supabase
          .from("matches")
          .update({
            status: "ready",
            score_text: null,
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`試合状態更新に失敗しました: ${updateError.message}`);
        }

        changed = true;
      } else if (!winner && !p1 && !p2 && match.status !== "pending") {
        const { error: updateError } = await supabase
          .from("matches")
          .update({
            status: "pending",
            score_text: null,
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`試合状態更新に失敗しました: ${updateError.message}`);
        }

        changed = true;
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: bracket, error: bracketError } = await supabase
      .from("brackets")
      .select("id")
      .eq("division_id", divisionId)
      .eq("bracket_type", "main")
      .single();

    if (bracketError || !bracket) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket/edit?error=no_bracket`,
          request.url
        )
      );
    }

    const { data: matchesData, error: matchesError } = await supabase
      .from("matches")
      .select(
        "id, round_no, match_no, next_match_id, next_slot, player1_entry_id, player2_entry_id, winner_entry_id, status"
      )
      .eq("bracket_id", bracket.id)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    if (matchesError) {
      return new Response(`試合取得に失敗しました: ${matchesError.message}`, {
        status: 500,
      });
    }

    const matches = (matchesData ?? []) as MatchRow[];

    if (matches.some((match) => match.status === "completed")) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket/edit?error=has_completed_results`,
          request.url
        )
      );
    }

    const firstRoundMatches = matches.filter((match) => match.round_no === 1);
    const bracketSize = firstRoundMatches.length * 2;

    const eligibleEntries = await getBracketEligibleEntries(supabase, divisionId);
    const eligibleEntryIds = eligibleEntries.map((entry) => entry.id);
    const validEntryIds = new Set(eligibleEntryIds);

    const slots: string[] = [];
    for (let i = 0; i < bracketSize; i += 1) {
      const value = formData.get(`slot_${i}`)?.toString() ?? "";
      if (value) {
        if (!validEntryIds.has(value)) {
          return NextResponse.redirect(
            new URL(
              `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket/edit?error=invalid_entry`,
              request.url
            )
          );
        }
        slots.push(value);
      } else {
        slots.push("");
      }
    }

    const assigned = slots.filter(Boolean);

    if (assigned.length !== eligibleEntryIds.length) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket/edit?error=wrong_count`,
          request.url
        )
      );
    }

    const uniqueAssigned = new Set(assigned);
    if (uniqueAssigned.size !== assigned.length) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket/edit?error=duplicate_entry`,
          request.url
        )
      );
    }

    for (const match of matches) {
      if (match.round_no === 1) {
        const matchNo = match.match_no ?? 0;
        const slotIndex = (matchNo - 1) * 2;
        const player1EntryId = slots[slotIndex] || null;
        const player2EntryId = slots[slotIndex + 1] || null;

        const { error } = await supabase
          .from("matches")
          .update({
            player1_entry_id: player1EntryId,
            player2_entry_id: player2EntryId,
            winner_entry_id: null,
            score_text: null,
            status: "pending",
          })
          .eq("id", match.id);

        if (error) {
          return new Response(`1回戦更新に失敗しました: ${error.message}`, {
            status: 500,
          });
        }
      } else {
        const { error } = await supabase
          .from("matches")
          .update({
            player1_entry_id: null,
            player2_entry_id: null,
            winner_entry_id: null,
            score_text: null,
            status: "pending",
          })
          .eq("id", match.id);

        if (error) {
          return new Response(`後続試合初期化に失敗しました: ${error.message}`, {
            status: 500,
          });
        }
      }
    }

    await applyWalkovers(supabase, bracket.id);

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket?updated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "組み合わせ修正に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EntryRow = {
  id: string;
  entry_name: string | null;
  ranking_for_draw: number | null;
  affiliation_order: number | null;
  status: string | null;
  checkins:
    | { id: string; status: string | null }[]
    | { id: string; status: string | null }
    | null;
};

function getCheckinStatus(entry: EntryRow) {
  const checkin = Array.isArray(entry.checkins) ? entry.checkins[0] : entry.checkins;
  return checkin?.status ?? null;
}

function sortEntries(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const seedA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const orderA = a.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    return (a.entry_name ?? "").localeCompare(b.entry_name ?? "", "ja");
  });
}

function generateRoundRobinRounds(entryIds: string[]) {
  const needsBye = entryIds.length % 2 === 1;
  let arr: Array<string | null> = needsBye ? [...entryIds, null] : [...entryIds];

  const rounds: Array<Array<{ team1: string | null; team2: string | null }>> = [];
  const totalRounds = arr.length - 1;

  for (let round = 0; round < totalRounds; round += 1) {
    const pairs: Array<{ team1: string | null; team2: string | null }> = [];

    for (let i = 0; i < arr.length / 2; i += 1) {
      pairs.push({
        team1: arr[i],
        team2: arr[arr.length - 1 - i],
      });
    }

    rounds.push(pairs);

    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop();
    if (last !== undefined) {
      arr = [fixed, last, ...rest];
    }
  }

  return rounds;
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

function buildKnockoutFirstRound(entryIds: string[]) {
  const size = nextPowerOfTwo(entryIds.length);
  const seedOrder = generateSeedOrder(size);
  const slots: Array<string | null> = Array(size).fill(null);

  for (let i = 0; i < entryIds.length; i += 1) {
    const pos = seedOrder[i] - 1;
    slots[pos] = entryIds[i];
  }

  const firstRound: Array<{ team1: string | null; team2: string | null }> = [];
  for (let i = 0; i < slots.length; i += 2) {
    firstRound.push({
      team1: slots[i] ?? null,
      team2: slots[i + 1] ?? null,
    });
  }

  return { size, firstRound };
}

async function deleteExistingTeamMatchRelatedData(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  divisionId: string;
}) {
  const { supabase, divisionId } = params;

  const { data: existingMatches } = await supabase
    .from("matches")
    .select("id, status")
    .eq("division_id", divisionId);

  const hasCompleted = (existingMatches ?? []).some((m) => m.status === "completed");
  if (hasCompleted) {
    throw new Error("結果入力済みの試合があるため再生成できません。");
  }

  if ((existingMatches ?? []).length === 0) return;

  const existingIds = (existingMatches ?? []).map((m) => m.id);

  if (existingIds.length > 0) {
    const { data: existingOrders } = await supabase
      .from("team_match_orders")
      .select("id")
      .in("team_match_id", existingIds);

    const orderIds = (existingOrders ?? []).map((o) => o.id);

    await supabase.from("team_match_games").delete().in("team_match_id", existingIds);

    if (orderIds.length > 0) {
      await supabase
        .from("team_match_order_lines")
        .delete()
        .in("team_match_order_id", orderIds);
    }

    await supabase.from("team_match_orders").delete().in("team_match_id", existingIds);
  }

  await supabase.from("matches").delete().eq("division_id", divisionId);
  await supabase.from("brackets").delete().eq("division_id", divisionId);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const generationTarget = String(formData.get("generationTarget") ?? "checked_in_only");

    if (!tournamentId || !divisionId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (generationTarget !== "checked_in_only" && generationTarget !== "all_entered") {
      return new Response("生成対象が不正です。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, event_type, format, team_match_format")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(
        `種目取得に失敗しました: ${divisionError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    if (division.event_type !== "team") {
      return new Response("このAPIは団体戦専用です。", { status: 400 });
    }

    if (division.format !== "league" && division.format !== "knockout") {
      return new Response("現段階では団体戦 league / knockout のみ対応しています。", {
        status: 400,
      });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("entries")
      .select(`
        id,
        entry_name,
        ranking_for_draw,
        affiliation_order,
        status,
        checkins (
          id,
          status
        )
      `)
      .eq("division_id", divisionId);

    if (entriesError) {
      return new Response(`エントリー取得に失敗しました: ${entriesError.message}`, {
        status: 500,
      });
    }

    const sourceEntries = ((entries ?? []) as EntryRow[]).filter((entry) => {
      if (entry.status === "withdrawn") return false;

      if (generationTarget === "checked_in_only") {
        return getCheckinStatus(entry) === "checked_in";
      }

      return true;
    });

    const activeEntries = sortEntries(sourceEntries);

    if (activeEntries.length < 2) {
      return new Response("生成対象チームが2チーム未満のため試合生成できません。", {
        status: 400,
      });
    }

    await deleteExistingTeamMatchRelatedData({ supabase, divisionId });

    if (division.format === "league") {
      const rounds = generateRoundRobinRounds(activeEntries.map((e) => e.id));

      let matchNo = 1;
      const matchRows: Array<{
        division_id: string;
        bracket_id: string | null;
        round_no: number;
        match_no: number;
        player1_entry_id: string;
        player2_entry_id: string;
        winner_entry_id: null;
        score_text: null;
        table_no: null;
        status: string;
        team_match_format: string | null;
        order_phase_open: boolean;
      }> = [];

      for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
        const round = rounds[roundIndex];

        for (const pair of round) {
          if (!pair.team1 || !pair.team2) continue;

          matchRows.push({
            division_id: divisionId,
            bracket_id: null,
            round_no: roundIndex + 1,
            match_no: matchNo,
            player1_entry_id: pair.team1,
            player2_entry_id: pair.team2,
            winner_entry_id: null,
            score_text: null,
            table_no: null,
            status: "pending",
            team_match_format: division.team_match_format ?? null,
            order_phase_open: true,
          });

          matchNo += 1;
        }
      }

      if (matchRows.length === 0) {
        return new Response("生成できる試合がありません。", { status: 400 });
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(matchRows);

      if (insertError) {
        return new Response(`試合作成に失敗しました: ${insertError.message}`, {
          status: 500,
        });
      }
    }

    if (division.format === "knockout") {
      const { data: bracket, error: bracketError } = await supabase
        .from("brackets")
        .insert({
          division_id: divisionId,
          bracket_type: "main",
        })
        .select("id")
        .single();

      if (bracketError || !bracket) {
        return new Response(`brackets追加失敗: ${bracketError?.message ?? "unknown"}`, {
          status: 500,
        });
      }

      const entryIds = activeEntries.map((e) => e.id);
      const { size, firstRound } = buildKnockoutFirstRound(entryIds);
      const totalRounds = Math.log2(size);

      const roundRows: Array<Array<{ id: string; match_no: number }>> = [];

      for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
        const numMatches = size / Math.pow(2, roundNo);
        const rows = Array.from({ length: numMatches }, (_, index) => ({
          division_id: divisionId,
          bracket_id: bracket.id,
          round_no: roundNo,
          match_no: index + 1,
          status: "pending",
          table_no: null,
          winner_entry_id: null,
          score_text: null,
          order_phase_open: true,
          team_match_format: division.team_match_format ?? null,
        }));

        const { data: insertedMatches, error } = await supabase
          .from("matches")
          .insert(rows)
          .select("id, match_no");

        if (error) {
          return new Response(`matches追加失敗: ${error.message}`, { status: 500 });
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

      for (let i = 0; i < firstRound.length; i += 1) {
        const pair = firstRound[i];
        const matchRow = roundRows[0][i];

        let status = "pending";
        let player1EntryId = pair.team1;
        let player2EntryId = pair.team2;
        let winnerEntryId: string | null = null;
        let scoreText: string | null = null;

        if (pair.team1 && !pair.team2) {
          winnerEntryId = pair.team1;
          status = "completed";
          scoreText = "BYE";
        } else if (!pair.team1 && pair.team2) {
          winnerEntryId = pair.team2;
          status = "completed";
          scoreText = "BYE";
        } else if (!pair.team1 && !pair.team2) {
          status = "skipped";
        }

        await supabase
          .from("matches")
          .update({
            player1_entry_id: player1EntryId,
            player2_entry_id: player2EntryId,
            winner_entry_id: winnerEntryId,
            status,
            score_text: scoreText,
          })
          .eq("id", matchRow.id);
      }

      for (let roundIndex = 1; roundIndex < roundRows.length; roundIndex += 1) {
        const prevRound = roundRows[roundIndex - 1];
        const currentRound = roundRows[roundIndex];

        for (let i = 0; i < currentRound.length; i += 1) {
          const prev1 = prevRound[i * 2];
          const prev2 = prevRound[i * 2 + 1];

          const { data: prevMatches } = await supabase
            .from("matches")
            .select("id, winner_entry_id, status")
            .in("id", [prev1.id, prev2.id]);

          const prev1Data = prevMatches?.find((m) => m.id === prev1.id);
          const prev2Data = prevMatches?.find((m) => m.id === prev2.id);

          const w1 = prev1Data?.winner_entry_id ?? null;
          const w2 = prev2Data?.winner_entry_id ?? null;

          let status = "pending";
          let scoreText: string | null = null;
          let winnerEntryId: string | null = null;

          if (w1 && !w2) {
            winnerEntryId = w1;
            status = "completed";
            scoreText = "BYE";
          } else if (!w1 && w2) {
            winnerEntryId = w2;
            status = "completed";
            scoreText = "BYE";
          } else if (!w1 && !w2) {
            status = "pending";
          }

          await supabase
            .from("matches")
            .update({
              player1_entry_id: w1,
              player2_entry_id: w2,
              winner_entry_id: winnerEntryId,
              status,
              score_text: scoreText,
            })
            .eq("id", currentRound[i].id);
        }
      }
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体戦試合生成に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
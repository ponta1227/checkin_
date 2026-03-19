import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildRankBracketSources,
  type LeagueStandingRow,
} from "@/lib/leagues/buildRankBracketSources";

type RequestBody = {
  divisionId?: string;
  bracketType?: string;
};

type BracketRow = {
  id: string;
};

type MatchInsertRow = {
  bracket_id: string;
  round_no: number;
  match_no: number;
  status: string;
  player1_entry_id?: string | null;
  player2_entry_id?: string | null;
  winner_entry_id?: string | null;
  source_group_id_1?: string | null;
  source_rank_1?: number | null;
  source_group_id_2?: string | null;
  source_rank_2?: number | null;
  next_match_id?: string | null;
  next_slot?: number | null;
};

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const divisionId = String(body.divisionId ?? "");
    const bracketType = String(body.bracketType ?? "");

    if (!divisionId || !bracketType) {
      return NextResponse.json(
        { ok: false, error: "divisionId または bracketType が不足しています" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data: bracketData, error: bracketError } = await supabase
      .from("brackets")
      .select("id")
      .eq("division_id", divisionId)
      .eq("bracket_type", bracketType)
      .maybeSingle<BracketRow>();

    if (bracketError) {
      return NextResponse.json(
        { ok: false, error: bracketError.message },
        { status: 500 }
      );
    }

    let bracketId = bracketData?.id ?? null;

    if (!bracketId) {
      const { data: insertedBracket, error: insertBracketError } = await supabase
        .from("brackets")
        .insert({
          division_id: divisionId,
          bracket_type: bracketType,
          status: "draft",
        })
        .select("id")
        .single<BracketRow>();

      if (insertBracketError || !insertedBracket) {
        return NextResponse.json(
          {
            ok: false,
            error: insertBracketError?.message ?? "bracket 作成に失敗しました",
          },
          { status: 500 }
        );
      }

      bracketId = insertedBracket.id;
    } else {
      const { error: deleteError } = await supabase
        .from("matches")
        .delete()
        .eq("bracket_id", bracketId);

      if (deleteError) {
        return NextResponse.json(
          { ok: false, error: deleteError.message },
          { status: 500 }
        );
      }
    }

    const { data: standingsData, error: standingsError } = await supabase
      .from("league_standings")
      .select("group_id, entry_id, rank")
      .eq("division_id", divisionId)
      .order("group_id", { ascending: true })
      .order("rank", { ascending: true });

    if (standingsError) {
      return NextResponse.json(
        { ok: false, error: standingsError.message },
        { status: 500 }
      );
    }

    const standingRows = (standingsData ?? []) as LeagueStandingRow[];

    const sources = buildRankBracketSources(bracketType, standingRows);

    if (sources.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: "順位別トーナメント参加者が2名未満のため生成できません",
        },
        { status: 400 }
      );
    }

    const bracketSize = nextPowerOfTwo(sources.length);
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

      const { data: insertedMatches, error: insertError } = await supabase
        .from("matches")
        .insert(rows)
        .select("id, match_no");

      if (insertError) {
        return NextResponse.json(
          { ok: false, error: insertError.message },
          { status: 500 }
        );
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

        const { error: updateLinkError } = await supabase
          .from("matches")
          .update({
            next_match_id: nextMatch.id,
            next_slot: nextSlot,
          })
          .eq("id", currentMatch.id);

        if (updateLinkError) {
          return NextResponse.json(
            { ok: false, error: updateLinkError.message },
            { status: 500 }
          );
        }
      }
    }

    const seedOrder = generateSeedOrder(bracketSize);

    const slots = Array<{
      entry_id: string | null;
      source_group_id: string | null;
      source_rank: number | null;
    }>(bracketSize).fill({
      entry_id: null,
      source_group_id: null,
      source_rank: null,
    });

    for (let i = 0; i < sources.length; i += 1) {
      const pos = seedOrder[i] - 1;
      slots[pos] = {
        entry_id: sources[i].entry_id,
        source_group_id: sources[i].source_group_id,
        source_rank: sources[i].source_rank,
      };
    }

    const firstRound = roundRows[0];

    for (let i = 0; i < firstRound.length; i += 1) {
      const match = firstRound[i];
      const left = slots[i * 2];
      const right = slots[i * 2 + 1];

      const updateData: MatchInsertRow = {
        bracket_id: bracketId,
        round_no: 1,
        match_no: match.match_no,
        status: "pending",
        player1_entry_id: left?.entry_id ?? null,
        player2_entry_id: right?.entry_id ?? null,
        winner_entry_id: null,
        source_group_id_1: left?.source_group_id ?? null,
        source_rank_1: left?.source_rank ?? null,
        source_group_id_2: right?.source_group_id ?? null,
        source_rank_2: right?.source_rank ?? null,
      };

      const { error: updateFirstRoundError } = await supabase
        .from("matches")
        .update(updateData)
        .eq("id", match.id);

      if (updateFirstRoundError) {
        return NextResponse.json(
          { ok: false, error: updateFirstRoundError.message },
          { status: 500 }
        );
      }
    }

    const { error: bracketUpdateError } = await supabase
      .from("brackets")
      .update({ status: "generated" })
      .eq("id", bracketId);

    if (bracketUpdateError) {
      return NextResponse.json(
        { ok: false, error: bracketUpdateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      bracketId,
      bracketType,
      count: sources.length,
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamLeagueStandingsByGroup } from "@/lib/team/buildStandings";

type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_affiliation: string | null;
  status: string | null;
  ranking_for_draw: number | null;
  affiliation_order: number | null;
  checkins?:
    | { id: string; status: string | null }[]
    | { id: string; status: string | null }
    | null;
};

type MatchRow = {
  id: string;
  division_id: string;
  round_no: number | null;
  match_no: number | null;
  status: string | null;
  score_text: string | null;
  winner_entry_id: string | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  bracket_id: string | null;
  league_group_no: number | null;
};

type LeagueSeedRef = {
  groupNo: number;
  rank: number;
};

type KnockoutSeedSlot = LeagueSeedRef | null;

function shuffleArray<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function sortEntriesForLeague(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const ar = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const br = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;

    const aa = a.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    const ba = b.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    if (aa !== ba) return aa - ba;

    return (a.entry_name ?? "").localeCompare(b.entry_name ?? "", "ja");
  });
}

function sortEntriesCheckedInOnly(entries: EntryRow[], generationTarget: string) {
  return entries.filter((entry) => {
    if (entry.status === "withdrawn") return false;
    if (generationTarget === "all_entered") return true;

    const checkin = Array.isArray(entry.checkins)
      ? entry.checkins[0]
      : (entry.checkins as { id: string; status: string | null } | null);

    return checkin?.status === "checked_in";
  });
}

function distributeEntriesToLeagues(
  entries: EntryRow[],
  baseLeagueSize: number,
  remainderPolicy: "allow_smaller" | "allow_larger"
) {
  if (entries.length === 0) return [] as EntryRow[][];
  if (baseLeagueSize < 2) baseLeagueSize = 2;

  let leagueCount = Math.floor(entries.length / baseLeagueSize);
  const remainder = entries.length % baseLeagueSize;

  if (leagueCount === 0) leagueCount = 1;

  let sizes: number[] = Array.from({ length: leagueCount }, () => baseLeagueSize);

  if (remainder > 0) {
    if (remainderPolicy === "allow_smaller") {
      sizes.push(remainder);
    } else {
      for (let i = 0; i < remainder; i += 1) {
        sizes[i % sizes.length] += 1;
      }
    }
  }

  const sorted = sortEntriesForLeague(entries);

  const leagues: EntryRow[][] = sizes.map(() => []);
  let direction = 1;
  let leagueIndex = 0;

  for (const entry of sorted) {
    while (leagues[leagueIndex].length >= sizes[leagueIndex]) {
      leagueIndex += direction;
      if (leagueIndex >= sizes.length) {
        direction = -1;
        leagueIndex = sizes.length - 1;
      }
      if (leagueIndex < 0) {
        direction = 1;
        leagueIndex = 0;
      }
    }

    leagues[leagueIndex].push(entry);

    leagueIndex += direction;
    if (leagueIndex >= sizes.length) {
      direction = -1;
      leagueIndex = sizes.length - 1;
    }
    if (leagueIndex < 0) {
      direction = 1;
      leagueIndex = 0;
    }
  }

  return leagues;
}

function buildRoundRobinPairs(entryIds: string[]) {
  const ids = [...entryIds];
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("BYE");

  const rounds: Array<Array<[string, string]>> = [];
  const n = ids.length;

  for (let round = 0; round < n - 1; round += 1) {
    const pairs: Array<[string, string]> = [];

    for (let i = 0; i < n / 2; i += 1) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") {
        pairs.push([a, b]);
      }
    }

    rounds.push(pairs);

    const fixed = ids[0];
    const rest = ids.slice(1);
    rest.unshift(rest.pop()!);
    ids.splice(0, ids.length, fixed, ...rest);
  }

  return rounds;
}

function buildUpperLowerSources(groupCount: number) {
  const upper: LeagueSeedRef[] = [];
  const lower: LeagueSeedRef[] = [];

  for (let groupNo = 1; groupNo <= groupCount; groupNo += 1) {
    upper.push({ groupNo, rank: 1 });
    upper.push({ groupNo, rank: 2 });
    lower.push({ groupNo, rank: 3 });
    lower.push({ groupNo, rank: 4 });
  }

  return {
    upper: upper.filter((x) => x.rank <= 2),
    lower: lower.filter((x) => x.rank >= 3),
  };
}

function buildRankBasedSources(groupCount: number, maxRank: number) {
  const result: Record<number, LeagueSeedRef[]> = {};
  for (let rank = 1; rank <= maxRank; rank += 1) {
    result[rank] = [];
    for (let groupNo = 1; groupNo <= groupCount; groupNo += 1) {
      result[rank].push({ groupNo, rank });
    }
  }
  return result;
}

function snakeSeedRefs(seedRefs: LeagueSeedRef[]) {
  const sorted = [...seedRefs].sort((a, b) => {
    if (a.groupNo !== b.groupNo) return a.groupNo - b.groupNo;
    return a.rank - b.rank;
  });

  return sorted;
}

function buildBracketRound1Pairs(seedRefs: LeagueSeedRef[]) {
  const refs = snakeSeedRefs(seedRefs);
  const size = nextPowerOfTwo(refs.length);
  const slots: KnockoutSeedSlot[] = Array.from({ length: size }, (_, i) => refs[i] ?? null);

  const pairs: Array<[KnockoutSeedSlot, KnockoutSeedSlot]> = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i] ?? null, slots[i + 1] ?? null]);
  }
  return { size, pairs };
}

async function deleteExistingLeagueAndKnockoutData(supabase: ReturnType<typeof createSupabaseServerClient>, divisionId: string) {
  const { data: existingBrackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId);

  const bracketIds = (existingBrackets ?? []).map((b) => b.id);

  await supabase
    .from("matches")
    .delete()
    .eq("division_id", divisionId);

  if (bracketIds.length > 0) {
    await supabase
      .from("brackets")
      .delete()
      .in("id", bracketIds);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const actionType = String(formData.get("actionType") ?? "");
    const generationTarget = String(formData.get("generationTarget") ?? "checked_in_only");

    const supabase = createSupabaseServerClient();

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, event_type, format")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(`種目取得に失敗しました: ${divisionError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    if (division.event_type !== "team") {
      return new Response("この種目は団体戦ではありません。", { status: 400 });
    }

    if (division.format !== "league_then_knockout") {
      return new Response("このAPIは league_then_knockout 専用です。", { status: 400 });
    }

    if (actionType === "generate_league") {
      const baseLeagueSize = Math.max(2, Number(formData.get("baseLeagueSize") ?? 3));
      const remainderPolicy =
        String(formData.get("remainderPolicy") ?? "allow_smaller") === "allow_larger"
          ? "allow_larger"
          : "allow_smaller";

      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select(`
          id,
          entry_name,
          entry_affiliation,
          status,
          ranking_for_draw,
          affiliation_order,
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

      const typedEntries = (entries ?? []) as EntryRow[];
      const targetEntries = sortEntriesCheckedInOnly(typedEntries, generationTarget);

      if (targetEntries.length < 2) {
        return new Response("リーグ生成に必要なチーム数が足りません。", { status: 400 });
      }

      await deleteExistingLeagueAndKnockoutData(supabase, divisionId);

      const leagues = distributeEntriesToLeagues(
        targetEntries,
        baseLeagueSize,
        remainderPolicy
      );

      const insertMatches: Array<Record<string, unknown>> = [];

      leagues.forEach((leagueEntries, leagueIndex) => {
        const groupNo = leagueIndex + 1;
        const rounds = buildRoundRobinPairs(leagueEntries.map((e) => e.id));

        rounds.forEach((pairs, roundIndex) => {
          pairs.forEach((pair, pairIndex) => {
            insertMatches.push({
              division_id: divisionId,
              bracket_id: null,
              league_group_no: groupNo,
              round_no: roundIndex + 1,
              match_no: pairIndex + 1,
              player1_entry_id: pair[0],
              player2_entry_id: pair[1],
              winner_entry_id: null,
              score_text: null,
              status: "pending",
              table_no: null,

              player1_source_type: null,
              player1_source_group_no: null,
              player1_source_rank: null,
              player2_source_type: null,
              player2_source_group_no: null,
              player2_source_rank: null,
            });
          });
        });
      });

      if (insertMatches.length > 0) {
        const { error: insertMatchError } = await supabase
          .from("matches")
          .insert(insertMatches);

        if (insertMatchError) {
          return new Response(`リーグ試合生成に失敗しました: ${insertMatchError.message}`, {
            status: 500,
          });
        }
      }

      return NextResponse.redirect(
        new URL(`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`, request.url)
      );
    }

    if (actionType === "generate_knockout") {
      const knockoutMode =
        String(formData.get("knockoutMode") ?? "upper_lower") === "rank_based"
          ? "rank_based"
          : "upper_lower";

      const { data: matches, error: matchesError } = await supabase
        .from("matches")
        .select(`
          id,
          division_id,
          round_no,
          match_no,
          status,
          score_text,
          winner_entry_id,
          player1_entry_id,
          player2_entry_id,
          bracket_id,
          league_group_no
        `)
        .eq("division_id", divisionId)
        .neq("status", "skipped");

      if (matchesError) {
        return new Response(`試合取得に失敗しました: ${matchesError.message}`, {
          status: 500,
        });
      }

      const typedMatches = (matches ?? []) as MatchRow[];
      const leagueMatches = typedMatches.filter((m) => !m.bracket_id);

      if (leagueMatches.length === 0) {
        return new Response("先に予選リーグを生成してください。", { status: 400 });
      }

      const leagueGroupNos = Array.from(
        new Set(
          leagueMatches
            .map((m) => m.league_group_no)
            .filter((v): v is number => Number.isInteger(v))
        )
      ).sort((a, b) => a - b);

      const groupCount = leagueGroupNos.length;

      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select("id, entry_name, entry_affiliation")
        .eq("division_id", divisionId);

      if (entriesError) {
        return new Response(`エントリー取得に失敗しました: ${entriesError.message}`, {
          status: 500,
        });
      }

      const groupedStandings = buildTeamLeagueStandingsByGroup({
        entries: (entries ?? []).map((e: any) => ({
          id: e.id,
          entry_name: e.entry_name,
          entry_affiliation: e.entry_affiliation,
        })),
        matches: leagueMatches.map((m) => ({
          id: m.id,
          player1_entry_id: m.player1_entry_id,
          player2_entry_id: m.player2_entry_id,
          winner_entry_id: m.winner_entry_id,
          score_text: m.score_text,
          status: m.status,
          league_group_no: m.league_group_no,
        })),
      });

      const maxRank = Math.max(
        ...groupedStandings.map((g) => g.standings.length),
        0
      );

      const { data: existingBrackets } = await supabase
        .from("brackets")
        .select("id")
        .eq("division_id", divisionId);

      const existingBracketIds = (existingBrackets ?? []).map((b) => b.id);
      if (existingBracketIds.length > 0) {
        await supabase.from("matches").delete().in("bracket_id", existingBracketIds);
        await supabase.from("brackets").delete().in("id", existingBracketIds);
      }

      const bracketsToCreate: Array<{ bracket_type: string }> = [];

      if (knockoutMode === "upper_lower") {
        bracketsToCreate.push({ bracket_type: "upper" });
        bracketsToCreate.push({ bracket_type: "lower" });
      } else {
        for (let rank = 1; rank <= maxRank; rank += 1) {
          bracketsToCreate.push({ bracket_type: `rank_${rank}` });
        }
      }

      const { data: insertedBrackets, error: insertBracketError } = await supabase
        .from("brackets")
        .insert(
          bracketsToCreate.map((b) => ({
            division_id: divisionId,
            bracket_type: b.bracket_type,
          }))
        )
        .select("id, bracket_type");

      if (insertBracketError || !insertedBrackets) {
        return new Response(
          `ブラケット生成に失敗しました: ${insertBracketError?.message ?? "unknown"}`,
          { status: 500 }
        );
      }

      const bracketIdMap = new Map<string, string>();
      for (const row of insertedBrackets) {
        bracketIdMap.set(String(row.bracket_type), String(row.id));
      }

      const knockoutMatchRows: Array<Record<string, unknown>> = [];

      if (knockoutMode === "upper_lower") {
        const { upper, lower } = buildUpperLowerSources(groupCount);

        const buckets = [
          { bracketType: "upper", refs: upper.filter((r) => r.rank <= 2) },
          { bracketType: "lower", refs: lower.filter((r) => r.rank <= maxRank) },
        ];

        for (const bucket of buckets) {
          const bracketId = bracketIdMap.get(bucket.bracketType);
          if (!bracketId || bucket.refs.length === 0) continue;

          const { size, pairs } = buildBracketRound1Pairs(bucket.refs);

          pairs.forEach((pair, index) => {
            const left = pair[0];
            const right = pair[1];

            knockoutMatchRows.push({
              division_id: divisionId,
              bracket_id: bracketId,
              league_group_no: null,
              round_no: 1,
              match_no: index + 1,
              status: "pending",
              score_text: null,
              winner_entry_id: null,
              table_no: null,

              player1_entry_id: null,
              player1_source_type: left ? "league_rank" : null,
              player1_source_group_no: left?.groupNo ?? null,
              player1_source_rank: left?.rank ?? null,

              player2_entry_id: null,
              player2_source_type: right ? "league_rank" : null,
              player2_source_group_no: right?.groupNo ?? null,
              player2_source_rank: right?.rank ?? null,
            });
          });

          let currentRoundSize = size / 2;
          let roundNo = 2;
          while (currentRoundSize >= 1) {
            for (let i = 0; i < currentRoundSize / 2; i += 1) {
              knockoutMatchRows.push({
                division_id: divisionId,
                bracket_id: bracketId,
                league_group_no: null,
                round_no: roundNo,
                match_no: i + 1,
                status: "pending",
                score_text: null,
                winner_entry_id: null,
                table_no: null,

                player1_entry_id: null,
                player1_source_type: null,
                player1_source_group_no: null,
                player1_source_rank: null,

                player2_entry_id: null,
                player2_source_type: null,
                player2_source_group_no: null,
                player2_source_rank: null,
              });
            }
            currentRoundSize /= 2;
            roundNo += 1;
          }
        }
      } else {
        const rankBuckets = buildRankBasedSources(groupCount, maxRank);

        for (let rank = 1; rank <= maxRank; rank += 1) {
          const refs = rankBuckets[rank].filter((r) =>
            groupedStandings.some((g) => g.groupNo === r.groupNo && g.standings.length >= rank)
          );

          if (refs.length === 0) continue;

          const bracketType = `rank_${rank}`;
          const bracketId = bracketIdMap.get(bracketType);
          if (!bracketId) continue;

          const { size, pairs } = buildBracketRound1Pairs(refs);

          pairs.forEach((pair, index) => {
            const left = pair[0];
            const right = pair[1];

            knockoutMatchRows.push({
              division_id: divisionId,
              bracket_id: bracketId,
              league_group_no: null,
              round_no: 1,
              match_no: index + 1,
              status: "pending",
              score_text: null,
              winner_entry_id: null,
              table_no: null,

              player1_entry_id: null,
              player1_source_type: left ? "league_rank" : null,
              player1_source_group_no: left?.groupNo ?? null,
              player1_source_rank: left?.rank ?? null,

              player2_entry_id: null,
              player2_source_type: right ? "league_rank" : null,
              player2_source_group_no: right?.groupNo ?? null,
              player2_source_rank: right?.rank ?? null,
            });
          });

          let currentRoundSize = size / 2;
          let roundNo = 2;
          while (currentRoundSize >= 1) {
            for (let i = 0; i < currentRoundSize / 2; i += 1) {
              knockoutMatchRows.push({
                division_id: divisionId,
                bracket_id: bracketId,
                league_group_no: null,
                round_no: roundNo,
                match_no: i + 1,
                status: "pending",
                score_text: null,
                winner_entry_id: null,
                table_no: null,

                player1_entry_id: null,
                player1_source_type: null,
                player1_source_group_no: null,
                player1_source_rank: null,

                player2_entry_id: null,
                player2_source_type: null,
                player2_source_group_no: null,
                player2_source_rank: null,
              });
            }
            currentRoundSize /= 2;
            roundNo += 1;
          }
        }
      }

      if (knockoutMatchRows.length > 0) {
        const { error: insertKnockoutError } = await supabase
          .from("matches")
          .insert(knockoutMatchRows);

        if (insertKnockoutError) {
          return new Response(`順位別トーナメント生成に失敗しました: ${insertKnockoutError.message}`, {
            status: 500,
          });
        }
      }

      return NextResponse.redirect(
        new URL(`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`, request.url)
      );
    }

    return new Response("actionType が不正です。", { status: 400 });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "リーグ→順位別トーナメント生成に失敗しました。",
      { status: 500 }
    );
  }
}
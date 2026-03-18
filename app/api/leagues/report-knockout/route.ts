import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EntryRow = {
  id: string;
  players:
    | {
        id: string;
        name: string | null;
        affiliation: string | null;
      }
    | null;
};

type LeagueGroupRow = {
  id: string;
  group_no: number;
  name: string;
};

type LeagueGroupMemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type LeagueMatchRow = {
  id: string;
  group_id: string;
  player1_entry_id: string;
  player2_entry_id: string;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string;
};

type StandingRow = {
  entry_id: string;
  slot_no: number;
  name: string;
  affiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
};

type BlockSpec = {
  name: string;
  rankFrom: number;
  rankTo: number;
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function parseScore(scoreText: string | null) {
  if (!scoreText) return null;
  const nums = scoreText.match(/\d+/g);
  if (!nums || nums.length < 2) return null;

  const p1 = Number(nums[0]);
  const p2 = Number(nums[1]);

  if (Number.isNaN(p1) || Number.isNaN(p2)) return null;
  return { p1, p2 };
}

function buildStandings(params: {
  groupMembers: LeagueGroupMemberRow[];
  groupMatches: LeagueMatchRow[];
  entryMap: Map<string, EntryRow>;
}) {
  const { groupMembers, groupMatches, entryMap } = params;

  const statsMap = new Map<string, StandingRow>();
  const directWinnerMap = new Map<string, string>();

  for (const member of groupMembers) {
    const entry = entryMap.get(member.entry_id);

    statsMap.set(member.entry_id, {
      entry_id: member.entry_id,
      slot_no: member.slot_no,
      name: entry?.players?.name ?? "-",
      affiliation: entry?.players?.affiliation ?? null,
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
    });
  }

  for (const match of groupMatches) {
    if (match.status !== "completed" || !match.winner_entry_id) continue;

    const p1 = statsMap.get(match.player1_entry_id);
    const p2 = statsMap.get(match.player2_entry_id);

    if (!p1 || !p2) continue;

    p1.played += 1;
    p2.played += 1;

    if (match.winner_entry_id === match.player1_entry_id) {
      p1.wins += 1;
      p2.losses += 1;
    } else if (match.winner_entry_id === match.player2_entry_id) {
      p2.wins += 1;
      p1.losses += 1;
    }

    directWinnerMap.set(
      pairKey(match.player1_entry_id, match.player2_entry_id),
      match.winner_entry_id
    );

    const parsed = parseScore(match.score_text);
    if (parsed) {
      p1.gamesWon += parsed.p1;
      p1.gamesLost += parsed.p2;
      p2.gamesWon += parsed.p2;
      p2.gamesLost += parsed.p1;
    }
  }

  const rows = [...statsMap.values()].map((row) => ({
    ...row,
    gameDiff: row.gamesWon - row.gamesLost,
  }));

  rows.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;

    const direct = directWinnerMap.get(pairKey(a.entry_id, b.entry_id));
    if (direct === a.entry_id) return -1;
    if (direct === b.entry_id) return 1;

    if (a.gameDiff !== b.gameDiff) return b.gameDiff - a.gameDiff;
    if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;

    return a.slot_no - b.slot_no;
  });

  return rows;
}

function parseBlockLines(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: BlockSpec[] = [];

  for (const line of lines) {
    const parts = line.split(",").map((v) => v.trim());
    if (parts.length < 3) return null;

    const name = parts[0];
    const rankFrom = Number(parts[1]);
    const rankTo = Number(parts[2]);

    if (!name || !Number.isInteger(rankFrom) || !Number.isInteger(rankTo) || rankFrom < 1 || rankTo < rankFrom) {
      return null;
    }

    blocks.push({ name, rankFrom, rankTo });
  }

  return blocks.length > 0 ? blocks : null;
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
  supabase: ReturnType<typeof createSupabaseServerClient>,
  matchId: string,
  winnerEntryId: string
) {
  const { data: currentMatch, error } = await supabase
    .from("league_knockout_matches")
    .select("next_match_id, next_slot")
    .eq("id", matchId)
    .single();

  if (error || !currentMatch?.next_match_id || !currentMatch?.next_slot) return;

  const updateData =
    currentMatch.next_slot === 1
      ? { player1_entry_id: winnerEntryId }
      : { player2_entry_id: winnerEntryId };

  await supabase
    .from("league_knockout_matches")
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

    const { data: matchesData, error } = await supabase
      .from("league_knockout_matches")
      .select("id, player1_entry_id, player2_entry_id, winner_entry_id, status")
      .eq("bracket_id", bracketId)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    if (error) {
      throw new Error(`順位別トーナメント試合取得に失敗しました: ${error.message}`);
    }

    const matches = matchesData ?? [];

    for (const match of matches) {
      const p1 = match.player1_entry_id;
      const p2 = match.player2_entry_id;
      const winner = match.winner_entry_id;

      if (!winner && p1 && !p2) {
        const { error: updateError } = await supabase
          .from("league_knockout_matches")
          .update({
            winner_entry_id: p1,
            score_text: null,
            status: "walkover",
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`不戦勝更新に失敗しました: ${updateError.message}`);
        }

        await advanceWinner(supabase, match.id, p1);
        changed = true;
      } else if (!winner && !p1 && p2) {
        const { error: updateError } = await supabase
          .from("league_knockout_matches")
          .update({
            winner_entry_id: p2,
            score_text: null,
            status: "walkover",
          })
          .eq("id", match.id);

        if (updateError) {
          throw new Error(`不戦勝更新に失敗しました: ${updateError.message}`);
        }

        await advanceWinner(supabase, match.id, p2);
        changed = true;
      } else if (!winner && p1 && p2 && match.status !== "ready") {
        const { error: updateError } = await supabase
          .from("league_knockout_matches")
          .update({
            status: "ready",
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
    const blockLines = formData.get("blockLines")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const blockSpecs = parseBlockLines(blockLines);
    if (!blockSpecs) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/knockout?error=invalid_block_line`,
          request.url
        )
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: entriesData } = await supabase
      .from("entries")
      .select(`
        id,
        players (
          id,
          name,
          affiliation
        )
      `)
      .eq("division_id", divisionId)
      .eq("status", "entered");

    const entries = (entriesData ?? []) as EntryRow[];
    const entryMap = new Map<string, EntryRow>();
    for (const entry of entries) {
      entryMap.set(entry.id, entry);
    }

    const { data: groupsData } = await supabase
      .from("league_groups")
      .select("id, group_no, name")
      .eq("division_id", divisionId)
      .order("group_no", { ascending: true });

    const groups = (groupsData ?? []) as LeagueGroupRow[];
    if (groups.length === 0) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/knockout?error=no_league_results`,
          request.url
        )
      );
    }

    const groupIds = groups.map((group) => group.id);

    const { data: membersData } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", groupIds)
      .order("slot_no", { ascending: true });

    const { data: leagueMatchesData } = await supabase
      .from("league_matches")
      .select(`
        id,
        group_id,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        score_text,
        status
      `)
      .in("group_id", groupIds);

    const members = (membersData ?? []) as LeagueGroupMemberRow[];
    const leagueMatches = (leagueMatchesData ?? []) as LeagueMatchRow[];

    if (leagueMatches.some((match) => match.status !== "completed")) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/knockout?error=incomplete_league`,
          request.url
        )
      );
    }

    const membersByGroup = new Map<string, LeagueGroupMemberRow[]>();
    for (const member of members) {
      if (!membersByGroup.has(member.group_id)) {
        membersByGroup.set(member.group_id, []);
      }
      membersByGroup.get(member.group_id)!.push(member);
    }

    const leagueMatchesByGroup = new Map<string, LeagueMatchRow[]>();
    for (const match of leagueMatches) {
      if (!leagueMatchesByGroup.has(match.group_id)) {
        leagueMatchesByGroup.set(match.group_id, []);
      }
      leagueMatchesByGroup.get(match.group_id)!.push(match);
    }

    const standingsByGroup = new Map<string, StandingRow[]>();
    for (const group of groups) {
      standingsByGroup.set(
        group.id,
        buildStandings({
          groupMembers: membersByGroup.get(group.id) ?? [],
          groupMatches: leagueMatchesByGroup.get(group.id) ?? [],
          entryMap,
        })
      );
    }

    const { error: deleteError } = await supabase
      .from("league_knockout_brackets")
      .delete()
      .eq("division_id", divisionId);

    if (deleteError) {
      return new Response(`既存順位別トーナメント削除に失敗しました: ${deleteError.message}`, {
        status: 500,
      });
    }

    for (let blockIndex = 0; blockIndex < blockSpecs.length; blockIndex += 1) {
      const spec = blockSpecs[blockIndex];

      const selectedEntryIds: string[] = [];

      for (let rank = spec.rankFrom; rank <= spec.rankTo; rank += 1) {
        for (const group of groups) {
          const standings = standingsByGroup.get(group.id) ?? [];
          const row = standings[rank - 1];
          if (row) {
            selectedEntryIds.push(row.entry_id);
          }
        }
      }

      if (selectedEntryIds.length < 2) {
        return NextResponse.redirect(
          new URL(
            `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/knockout?error=block_too_few`,
            request.url
          )
        );
      }

      const { data: bracketData, error: bracketError } = await supabase
        .from("league_knockout_brackets")
        .insert({
          division_id: divisionId,
          name: spec.name,
          rank_from: spec.rankFrom,
          rank_to: spec.rankTo,
          display_order: blockIndex + 1,
        })
        .select("id")
        .single();

      if (bracketError || !bracketData) {
        return new Response(`順位別トーナメント作成に失敗しました: ${bracketError?.message}`, {
          status: 500,
        });
      }

      const bracketSize = nextPowerOfTwo(selectedEntryIds.length);
      const totalRounds = Math.log2(bracketSize);

      const roundRows: Array<Array<{ id: string; match_no: number }>> = [];

      for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
        const numMatches = bracketSize / Math.pow(2, roundNo);

        const rows = Array.from({ length: numMatches }, (_, index) => ({
          bracket_id: bracketData.id,
          round_no: roundNo,
          match_no: index + 1,
          status: "pending",
        }));

        const { data: insertedMatches, error } = await supabase
          .from("league_knockout_matches")
          .insert(rows)
          .select("id, match_no");

        if (error) {
          return new Response(`試合作成に失敗しました: ${error.message}`, {
            status: 500,
          });
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

          const { error } = await supabase
            .from("league_knockout_matches")
            .update({
              next_match_id: nextMatch.id,
              next_slot: nextSlot,
            })
            .eq("id", currentMatch.id);

          if (error) {
            return new Response(`試合リンク設定に失敗しました: ${error.message}`, {
              status: 500,
            });
          }
        }
      }

      const seedOrder = generateSeedOrder(bracketSize);
      const slots = Array<string | null>(bracketSize).fill(null);

      for (let i = 0; i < selectedEntryIds.length; i += 1) {
        const pos = seedOrder[i] - 1;
        slots[pos] = selectedEntryIds[i];
      }

      const firstRound = roundRows[0];

      for (let i = 0; i < firstRound.length; i += 1) {
        const match = firstRound[i];
        const p1 = slots[i * 2] ?? null;
        const p2 = slots[i * 2 + 1] ?? null;

        const { error } = await supabase
          .from("league_knockout_matches")
          .update({
            player1_entry_id: p1,
            player2_entry_id: p2,
          })
          .eq("id", match.id);

        if (error) {
          return new Response(`初戦配置に失敗しました: ${error.message}`, {
            status: 500,
          });
        }
      }

      await applyWalkovers(supabase, bracketData.id);
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/knockout?generated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "順位別トーナメント生成に失敗しました。";

    return new Response(message, {
      status: 500,
    });
  }
}
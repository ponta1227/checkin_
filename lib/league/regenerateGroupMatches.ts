import { createSupabaseServerClient } from "@/lib/supabase/server";

type GroupMemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type GeneratedMatch = {
  group_id: string;
  round_no: number;
  slot_no: number;
  match_no: number;
  table_no: string | null;
  player1_entry_id: string;
  player2_entry_id: string;
  referee_entry_id: string | null;
  status: string;
};

function rotateForRoundRobin<T>(arr: T[]) {
  if (arr.length <= 2) return arr;
  const fixed = arr[0];
  const rest = arr.slice(1);
  const last = rest.pop();
  if (last === undefined) return arr;
  return [fixed, last, ...rest];
}

function generateRoundRobinRounds(memberEntryIds: string[]) {
  const needsBye = memberEntryIds.length % 2 === 1;
  let arr: Array<string | null> = needsBye
    ? [...memberEntryIds, null]
    : [...memberEntryIds];

  const totalRounds = arr.length - 1;
  const rounds: Array<
    Array<{ player1_entry_id: string | null; player2_entry_id: string | null }>
  > = [];

  for (let roundNo = 1; roundNo <= totalRounds; roundNo += 1) {
    const pairs: Array<{ player1_entry_id: string | null; player2_entry_id: string | null }> =
      [];

    for (let i = 0; i < arr.length / 2; i += 1) {
      pairs.push({
        player1_entry_id: arr[i],
        player2_entry_id: arr[arr.length - 1 - i],
      });
    }

    rounds.push(pairs);
    arr = rotateForRoundRobin(arr);
  }

  return rounds;
}

function sortCandidatesByRefCount(
  candidates: string[],
  refereeCount: Map<string, number>,
  memberEntryIds: string[]
) {
  return [...candidates].sort((a, b) => {
    const ra = refereeCount.get(a) ?? 0;
    const rb = refereeCount.get(b) ?? 0;
    if (ra !== rb) return ra - rb;
    return memberEntryIds.indexOf(a) - memberEntryIds.indexOf(b);
  });
}

function assignReferees(params: {
  matches: GeneratedMatch[];
  memberEntryIds: string[];
}) {
  const { matches, memberEntryIds } = params;

  const playersBySlot = new Map<number, Set<string>>();
  const refereesBySlot = new Map<number, Set<string>>();
  const refereeCount = new Map<string, number>();

  for (const memberId of memberEntryIds) {
    refereeCount.set(memberId, 0);
  }

  for (const match of matches) {
    if (!playersBySlot.has(match.slot_no)) {
      playersBySlot.set(match.slot_no, new Set());
    }
    playersBySlot.get(match.slot_no)!.add(match.player1_entry_id);
    playersBySlot.get(match.slot_no)!.add(match.player2_entry_id);

    if (!refereesBySlot.has(match.slot_no)) {
      refereesBySlot.set(match.slot_no, new Set());
    }
  }

  const sortedMatches = [...matches].sort((a, b) => {
    if (a.slot_no !== b.slot_no) return a.slot_no - b.slot_no;
    return a.match_no - b.match_no;
  });

  for (const match of sortedMatches) {
    const currentSlot = match.slot_no;
    const prevSlot = currentSlot - 1;
    const nextSlot = currentSlot + 1;

    const currentPlayers = playersBySlot.get(currentSlot) ?? new Set<string>();
    const currentRefs = refereesBySlot.get(currentSlot) ?? new Set<string>();
    const prevPlayers = playersBySlot.get(prevSlot) ?? new Set<string>();
    const prevRefs = refereesBySlot.get(prevSlot) ?? new Set<string>();
    const nextPlayers = playersBySlot.get(nextSlot) ?? new Set<string>();

    let candidates = memberEntryIds.filter((entryId) => {
      if (entryId === match.player1_entry_id || entryId === match.player2_entry_id) {
        return false;
      }
      if (currentPlayers.has(entryId)) return false;
      if (currentRefs.has(entryId)) return false;
      if (prevPlayers.has(entryId)) return false;
      if (prevRefs.has(entryId)) return false;
      if (nextPlayers.has(entryId)) return false;
      return true;
    });

    if (candidates.length === 0) {
      candidates = memberEntryIds.filter((entryId) => {
        if (entryId === match.player1_entry_id || entryId === match.player2_entry_id) {
          return false;
        }
        if (currentPlayers.has(entryId)) return false;
        if (currentRefs.has(entryId)) return false;
        if (prevPlayers.has(entryId)) return false;
        if (prevRefs.has(entryId)) return false;
        return true;
      });
    }

    if (candidates.length === 0) {
      candidates = memberEntryIds.filter((entryId) => {
        if (entryId === match.player1_entry_id || entryId === match.player2_entry_id) {
          return false;
        }
        return true;
      });
    }

    if (candidates.length === 0) {
      match.referee_entry_id = null;
      continue;
    }

    const sortedCandidates = sortCandidatesByRefCount(
      candidates,
      refereeCount,
      memberEntryIds
    );

    const chosen = sortedCandidates[0];
    match.referee_entry_id = chosen;

    if (!refereesBySlot.has(currentSlot)) {
      refereesBySlot.set(currentSlot, new Set());
    }
    refereesBySlot.get(currentSlot)!.add(chosen);
    refereeCount.set(chosen, (refereeCount.get(chosen) ?? 0) + 1);
  }

  return sortedMatches;
}

export async function regenerateGroupMatches(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  groupId: string;
}) {
  const { supabase, groupId } = params;

  const { data: group, error: groupError } = await supabase
    .from("league_groups")
    .select("id, table_numbers")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    throw new Error(`リーグ情報取得に失敗しました: ${groupError?.message ?? "unknown"}`);
  }

  const { data: membersData, error: membersError } = await supabase
    .from("league_group_members")
    .select("id, group_id, entry_id, slot_no")
    .eq("group_id", groupId)
    .order("slot_no", { ascending: true });

  if (membersError) {
    throw new Error(`リーグメンバー取得に失敗しました: ${membersError.message}`);
  }

  const members = (membersData ?? []) as GroupMemberRow[];
  const memberIds = members.map((m) => m.entry_id);

  const { error: deleteMatchesError } = await supabase
    .from("league_matches")
    .delete()
    .eq("group_id", groupId);

  if (deleteMatchesError) {
    throw new Error(`既存試合作成の削除に失敗しました: ${deleteMatchesError.message}`);
  }

  if (memberIds.length < 2) {
    return;
  }

  const rounds = generateRoundRobinRounds(memberIds);
  const tableNumbers = (group.table_numbers ?? []) as string[];
  const effectiveTables = tableNumbers.length > 0 ? tableNumbers : [""];
  const tableCount = effectiveTables.length;

  let globalMatchNo = 1;
  let globalSlotNo = 1;
  const generatedMatches: GeneratedMatch[] = [];

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const roundNo = roundIndex + 1;

    const actualPairs = rounds[roundIndex].filter(
      (pair) => pair.player1_entry_id && pair.player2_entry_id
    ) as Array<{ player1_entry_id: string; player2_entry_id: string }>;

    for (let batchStart = 0; batchStart < actualPairs.length; batchStart += tableCount) {
      const batch = actualPairs.slice(batchStart, batchStart + tableCount);

      for (let i = 0; i < batch.length; i += 1) {
        generatedMatches.push({
          group_id: groupId,
          round_no: roundNo,
          slot_no: globalSlotNo,
          match_no: globalMatchNo,
          table_no: effectiveTables[i] || null,
          player1_entry_id: batch[i].player1_entry_id,
          player2_entry_id: batch[i].player2_entry_id,
          referee_entry_id: null,
          status: "ready",
        });
        globalMatchNo += 1;
      }

      globalSlotNo += 1;
    }
  }

  const matchesWithRefs = assignReferees({
    matches: generatedMatches,
    memberEntryIds: memberIds,
  });

  const { error: insertMatchesError } = await supabase
    .from("league_matches")
    .insert(matchesWithRefs);

  if (insertMatchesError) {
    throw new Error(`試合再生成に失敗しました: ${insertMatchesError.message}`);
  }

  const { error: updateGroupError } = await supabase
    .from("league_groups")
    .update({
      results_confirmed: false,
    })
    .eq("id", groupId);

  if (updateGroupError) {
    throw new Error(`リーグ状態更新に失敗しました: ${updateGroupError.message}`);
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EntryPlayerRow = {
  id: string;
  name: string | null;
  rating: number | null;
  affiliation: string | null;
};

type EntryCheckinRow = {
  status: string | null;
};

type EntryRow = {
  id: string;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  affiliation_order: number | null;
  players: EntryPlayerRow[];
  checkins: EntryCheckinRow[];
};

type LeagueGroupInsertRow = {
  id: string;
  group_no: number;
  name: string;
  table_numbers: string[] | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEntryPlayer(value: unknown): EntryPlayerRow | null {
  if (!isRecord(value)) return null;

  const id = toRequiredString(value.id);
  if (!id) return null;

  return {
    id,
    name: toStringOrNull(value.name),
    rating: toNumberOrNull(value.rating),
    affiliation: toStringOrNull(value.affiliation),
  };
}

function normalizeEntryCheckin(value: unknown): EntryCheckinRow | null {
  if (!isRecord(value)) return null;

  return {
    status: toStringOrNull(value.status),
  };
}

function normalizeEntryRow(value: unknown): EntryRow | null {
  if (!isRecord(value)) return null;

  const id = toRequiredString(value.id);
  if (!id) return null;

  const rawPlayers = value.players;
  const rawCheckins = value.checkins;

  const playersSource = Array.isArray(rawPlayers)
    ? rawPlayers
    : isRecord(rawPlayers)
      ? [rawPlayers]
      : [];

  const checkinsSource = Array.isArray(rawCheckins)
    ? rawCheckins
    : isRecord(rawCheckins)
      ? [rawCheckins]
      : [];

  const players = playersSource
    .map((player) => normalizeEntryPlayer(player))
    .filter((player): player is EntryPlayerRow => player !== null);

  const checkins = checkinsSource
    .map((checkin) => normalizeEntryCheckin(checkin))
    .filter((checkin): checkin is EntryCheckinRow => checkin !== null);

  return {
    id,
    entry_rating: toNumberOrNull(value.entry_rating),
    ranking_for_draw: toNumberOrNull(value.ranking_for_draw),
    affiliation_order: toNumberOrNull(value.affiliation_order),
    players,
    checkins,
  };
}

function normalizeLeagueGroupInsertRow(value: unknown): LeagueGroupInsertRow | null {
  if (!isRecord(value)) return null;

  const id = toRequiredString(value.id);
  const groupNo = toNumberOrNull(value.group_no);
  const name = toStringOrNull(value.name);

  if (!id || groupNo === null || name === null) return null;

  const rawTableNumbers = value.table_numbers;
  const tableNumbers = Array.isArray(rawTableNumbers)
    ? rawTableNumbers.filter((v): v is string => typeof v === "string")
    : null;

  return {
    id,
    group_no: groupNo,
    name,
    table_numbers: tableNumbers,
  };
}

function getPrimaryPlayer(entry: EntryRow) {
  return entry.players[0] ?? null;
}

function getEntryDisplayName(entry: EntryRow) {
  if (entry.players.length === 0) return "";

  const names = entry.players
    .map((player) => player.name?.trim() || "")
    .filter((name) => name !== "");

  return names.join(" / ");
}

function getEntryAffiliation(entry: EntryRow) {
  const affiliations = entry.players
    .map((player) => player.affiliation?.trim() || "")
    .filter((affiliation) => affiliation !== "");

  return affiliations[0] ?? "";
}

function getEntryRatingValue(entry: EntryRow) {
  const primary = getPrimaryPlayer(entry);
  return entry.entry_rating ?? primary?.rating ?? Number.NEGATIVE_INFINITY;
}

function getCheckinStatus(entry: EntryRow) {
  const checkin = entry.checkins[0] ?? null;
  return checkin?.status ?? null;
}

function shuffleArray<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortByStrength(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const seedA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const ra = getEntryRatingValue(a);
    const rb = getEntryRatingValue(b);
    if (ra !== rb) return rb - ra;

    const aa = a.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    const ab = b.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    if (aa !== ab) return aa - ab;

    return getEntryDisplayName(a).localeCompare(getEntryDisplayName(b), "ja");
  });
}

function sortGroupMembersForLeagueOrder(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const seedA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const ra = getEntryRatingValue(a);
    const rb = getEntryRatingValue(b);
    if (ra !== rb) return rb - ra;

    const da = a.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    const db = b.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;

    return getEntryDisplayName(a).localeCompare(getEntryDisplayName(b), "ja");
  });
}

function parseTableLines(raw: string, groupCount: number) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  while (lines.length < groupCount) lines.push("");
  const usedLines = lines.slice(0, groupCount);

  return usedLines.map((line) => {
    if (!line) return [] as string[];
    return line
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  });
}

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

function buildGroupSizes(total: number, groupCount: number, maxGroupSize: number) {
  if (groupCount < 1) {
    throw new Error("リーグ数が不正です。");
  }

  if (total < groupCount * 2) {
    throw new Error("各リーグ最低2名になるように設定してください。");
  }

  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;

  const sizes = Array.from({ length: groupCount }, (_, index) =>
    index < remainder ? base + 1 : base
  );

  if (sizes.some((size) => size > maxGroupSize)) {
    throw new Error("指定したリーグ人数では参加者を収められません。");
  }

  if (sizes.some((size) => size < 2)) {
    throw new Error("2名未満のリーグが発生するため生成できません。");
  }

  return sizes;
}

function seededSnakeGroupIndex(seed: number, groupCount: number) {
  const zero = seed - 1;
  const lap = Math.floor(zero / groupCount);
  const pos = zero % groupCount;
  return lap % 2 === 0 ? pos : groupCount - 1 - pos;
}

function placeSeededEntriesStrict(
  entries: EntryRow[],
  groupSizes: number[]
) {
  const groups: EntryRow[][] = groupSizes.map(() => []);
  const seeded = [...entries]
    .filter((e) => e.ranking_for_draw !== null)
    .sort(
      (a, b) =>
        (a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER) -
        (b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER)
    );

  const usedIds = new Set<string>();

  for (const entry of seeded) {
    const seed = entry.ranking_for_draw;
    if (seed === null) continue;

    const idx = seededSnakeGroupIndex(seed, groupSizes.length);
    if (groups[idx].length >= groupSizes[idx]) {
      throw new Error(
        `seed ${seed} を配置できません。リーグ数または人数設定を見直してください。`
      );
    }

    groups[idx].push(entry);
    usedIds.add(entry.id);
  }

  const unseeded = entries.filter((e) => !usedIds.has(e.id));
  return { groups, unseeded };
}

function placeWithAffiliationAvoidance(
  groups: EntryRow[][],
  groupSizes: number[],
  entries: EntryRow[],
  mode: "rating_close" | "balanced" | "random"
) {
  const source =
    mode === "random"
      ? shuffleArray(entries)
      : sortByStrength(entries);

  const orderBase = [...groups.keys()];

  let snakeForward = true;
  let pointer = 0;

  for (const entry of source) {
    const affiliation = getEntryAffiliation(entry);

    let order: number[];
    if (mode === "balanced") {
      order = snakeForward ? [...orderBase] : [...orderBase].reverse();
      pointer += 1;
      if (pointer >= orderBase.length) {
        pointer = 0;
        snakeForward = !snakeForward;
      }
    } else {
      order = [...orderBase];
    }

    let placed = false;

    for (const idx of order) {
      if (groups[idx].length >= groupSizes[idx]) continue;

      const sameAffiliationCount = groups[idx].filter(
        (e) => affiliation !== "" && getEntryAffiliation(e) === affiliation
      ).length;

      if (sameAffiliationCount === 0) {
        groups[idx].push(entry);
        placed = true;
        break;
      }
    }

    if (!placed) {
      for (const idx of order) {
        if (groups[idx].length >= groupSizes[idx]) continue;
        groups[idx].push(entry);
        placed = true;
        break;
      }
    }

    if (!placed) {
      throw new Error("参加者を配置できませんでした。");
    }
  }

  return groups.map((g) => sortGroupMembersForLeagueOrder(g));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const groupSize = Number(formData.get("groupSize")?.toString() ?? "0");
    const groupCount = Number(formData.get("groupCount")?.toString() ?? "0");
    const groupingMode = formData.get("groupingMode")?.toString() ?? "rating_close";
    const tableLinesRaw = formData.get("tableLines")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    if (!Number.isInteger(groupSize) || groupSize < 2) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league?error=invalid_group_size`,
          request.url
        )
      );
    }

    if (!Number.isInteger(groupCount) || groupCount < 1) {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league?error=invalid_group_count`,
          request.url
        )
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select(`
        id,
        entry_rating,
        ranking_for_draw,
        affiliation_order,
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

    if (entriesError) {
      return new Response(`参加者取得に失敗しました: ${entriesError.message}`, {
        status: 500,
      });
    }

    const entries: EntryRow[] = Array.isArray(entriesData)
      ? entriesData
          .map((entry) => normalizeEntryRow(entry))
          .filter((entry): entry is EntryRow => entry !== null)
      : [];

    const activeEntries = entries.filter((entry) => {
      const status = getCheckinStatus(entry);
      return status !== "withdrawn";
    });

    let groupSizes: number[];
    try {
      groupSizes = buildGroupSizes(activeEntries.length, groupCount, groupSize);
    } catch {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league?error=wrong_total`,
          request.url
        )
      );
    }

    const seededPlaced = placeSeededEntriesStrict(activeEntries, groupSizes);

    let groupedEntries = placeWithAffiliationAvoidance(
      seededPlaced.groups,
      groupSizes,
      seededPlaced.unseeded,
      groupingMode as "rating_close" | "balanced" | "random"
    );

    if (groupingMode === "balanced") {
      groupedEntries = groupedEntries.map((g) => sortGroupMembersForLeagueOrder(g));
    }

    const tableNumbersPerGroup = parseTableLines(tableLinesRaw, groupCount);

    const { error: deleteError } = await supabase
      .from("league_groups")
      .delete()
      .eq("division_id", divisionId);

    if (deleteError) {
      return new Response(`既存リーグ削除に失敗しました: ${deleteError.message}`, {
        status: 500,
      });
    }

    const groupRows = groupedEntries.map((_, index) => ({
      division_id: divisionId,
      group_no: index + 1,
      name: `${index + 1}リーグ`,
      table_numbers: tableNumbersPerGroup[index] ?? [],
    }));

    const { data: insertedGroupsData, error: insertGroupsError } = await supabase
      .from("league_groups")
      .insert(groupRows)
      .select("id, group_no, name, table_numbers");

    if (insertGroupsError) {
      return new Response(`リーグ作成に失敗しました: ${insertGroupsError.message}`, {
        status: 500,
      });
    }

    const insertedGroups: LeagueGroupInsertRow[] = Array.isArray(insertedGroupsData)
      ? insertedGroupsData
          .map((group) => normalizeLeagueGroupInsertRow(group))
          .filter((group): group is LeagueGroupInsertRow => group !== null)
      : [];

    const sortedInsertedGroups = [...insertedGroups].sort(
      (a, b) => a.group_no - b.group_no
    );

    for (let groupIndex = 0; groupIndex < sortedInsertedGroups.length; groupIndex += 1) {
      const group = sortedInsertedGroups[groupIndex];
      const members = groupedEntries[groupIndex] ?? [];
      const memberIds = members.map((entry) => entry.id);

      const memberRows = memberIds.map((entryId, index) => ({
        group_id: group.id,
        entry_id: entryId,
        slot_no: index + 1,
      }));

      const { error: memberInsertError } = await supabase
        .from("league_group_members")
        .insert(memberRows);

      if (memberInsertError) {
        return new Response(`リーグメンバー保存に失敗しました: ${memberInsertError.message}`, {
          status: 500,
        });
      }

      const rounds = generateRoundRobinRounds(memberIds);
      const tableNumbers = group.table_numbers ?? [];
      const effectiveTables = tableNumbers.length > 0 ? tableNumbers : [""];
      const tableCount = effectiveTables.length;

      let globalMatchNo = 1;
      let globalSlotNo = 1;
      const generatedMatches: GeneratedMatch[] = [];

      for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
        const roundNo = roundIndex + 1;

        const actualPairs = rounds[roundIndex].filter(
          (pair): pair is { player1_entry_id: string; player2_entry_id: string } =>
            pair.player1_entry_id !== null && pair.player2_entry_id !== null
        );

        for (let batchStart = 0; batchStart < actualPairs.length; batchStart += tableCount) {
          const batch = actualPairs.slice(batchStart, batchStart + tableCount);

          for (let i = 0; i < batch.length; i += 1) {
            generatedMatches.push({
              group_id: group.id,
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

      const { error: matchInsertError } = await supabase
        .from("league_matches")
        .insert(matchesWithRefs);

      if (matchInsertError) {
        return new Response(`リーグ試合保存に失敗しました: ${matchInsertError.message}`, {
          status: 500,
        });
      }
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league?generated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ生成に失敗しました。";

    return new Response(message, {
      status: 500,
    });
  }
}
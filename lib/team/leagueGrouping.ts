export type RemainderPolicy = "allow_smaller" | "allow_larger";

type RankedAffiliationEntry = {
  entry_affiliation?: string | null;
  application_rank?: number | null;
  ranking_for_draw?: number | null;
  affiliation_order?: number | null;
  entry_name?: string | null;
};

export function buildLeagueGroupSizes(params: {
  totalTeams: number;
  baseLeagueSize: number;
  remainderPolicy: RemainderPolicy;
}) {
  const { totalTeams, baseLeagueSize, remainderPolicy } = params;

  if (totalTeams <= 0) return [];
  if (baseLeagueSize < 2) {
    throw new Error("リーグ人数は2以上で指定してください。");
  }

  if (remainderPolicy === "allow_smaller") {
    const groupCount = Math.ceil(totalTeams / baseLeagueSize);
    const base = Math.floor(totalTeams / groupCount);
    const remainder = totalTeams % groupCount;

    return Array.from({ length: groupCount }, (_, index) =>
      index < remainder ? base + 1 : base
    ).filter((size) => size > 0);
  }

  const groupCount = Math.max(1, Math.floor(totalTeams / baseLeagueSize));
  const base = Math.floor(totalTeams / groupCount);
  const remainder = totalTeams % groupCount;

  return Array.from({ length: groupCount }, (_, index) =>
    index < remainder ? base + 1 : base
  ).filter((size) => size > 0);
}

export function distributeEntriesSnake<T>(params: {
  entries: T[];
  groupSizes: number[];
}) {
  const { entries, groupSizes } = params;

  const groups: T[][] = groupSizes.map(() => []);
  const remaining = [...groupSizes];

  let index = 0;
  let direction: 1 | -1 = 1;

  function findNextAvailable(start: number, dir: 1 | -1) {
    let i = start;

    while (i >= 0 && i < remaining.length) {
      if (remaining[i] > 0) return i;
      i += dir;
    }

    i = dir === 1 ? remaining.length - 1 : 0;
    while (i >= 0 && i < remaining.length) {
      if (remaining[i] > 0) return i;
      i -= dir;
    }

    return -1;
  }

  for (const entry of entries) {
    const next = findNextAvailable(index, direction);
    if (next === -1) break;

    groups[next].push(entry);
    remaining[next] -= 1;

    index = next + direction;
    if (index >= remaining.length) {
      direction = -1;
      index = remaining.length - 1;
    } else if (index < 0) {
      direction = 1;
      index = 0;
    }
  }

  return groups;
}

function getPrimaryRank(entry: RankedAffiliationEntry) {
  if (entry.application_rank !== null && entry.application_rank !== undefined) {
    return entry.application_rank;
  }
  if (entry.ranking_for_draw !== null && entry.ranking_for_draw !== undefined) {
    return entry.ranking_for_draw;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortLeagueMembers<T extends RankedAffiliationEntry>(group: T[]) {
  group.sort((a, b) => {
    const rankA = getPrimaryRank(a);
    const rankB = getPrimaryRank(b);
    if (rankA !== rankB) return rankA - rankB;

    const orderA = a.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.affiliation_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    return String(a.entry_name ?? "").localeCompare(String(b.entry_name ?? ""), "ja");
  });
}

function makeSnakeOrder(groupCount: number) {
  const order: number[] = [];
  for (let i = 0; i < groupCount; i += 1) order.push(i);
  for (let i = groupCount - 1; i >= 0; i -= 1) order.push(i);
  return order;
}

export function distributeEntriesAvoidSameAffiliation<T extends RankedAffiliationEntry>(params: {
  entries: T[];
  groupSizes: number[];
}) {
  const { entries, groupSizes } = params;

  const groups: T[][] = groupSizes.map(() => []);
  const capacities = [...groupSizes];

  if (groupSizes.length === 0) return groups;

  // entries は事前に強い順にソート済みで入ってくる前提
  // 「強さの層」を snake で配り、その中で同一所属だけ軽く回避する
  const snake = makeSnakeOrder(groupSizes.length);
  let snakePtr = 0;

  for (const entry of entries) {
    const affiliation = String(entry.entry_affiliation ?? "").trim();
    const startPtr = snakePtr;

    let chosenGroup = -1;
    let fallbackGroup = -1;
    let bestFallbackSize = Number.POSITIVE_INFINITY;

    do {
      const groupIndex = snake[snakePtr % snake.length];
      snakePtr += 1;

      if (capacities[groupIndex] <= 0) {
        continue;
      }

      const currentGroup = groups[groupIndex];
      const sameAffiliationCount =
        affiliation === ""
          ? 0
          : currentGroup.filter(
              (member) => String(member.entry_affiliation ?? "").trim() === affiliation
            ).length;

      if (sameAffiliationCount === 0) {
        chosenGroup = groupIndex;
        break;
      }

      if (currentGroup.length < bestFallbackSize) {
        bestFallbackSize = currentGroup.length;
        fallbackGroup = groupIndex;
      }
    } while (snakePtr - startPtr <= snake.length);

    if (chosenGroup === -1) {
      chosenGroup = fallbackGroup;
    }

    if (chosenGroup === -1) {
      const anyAvailable = capacities.findIndex((v) => v > 0);
      if (anyAvailable === -1) break;
      chosenGroup = anyAvailable;
    }

    groups[chosenGroup].push(entry);
    capacities[chosenGroup] -= 1;
  }

  // 各リーグ内は application_rank 優先で強い順に並べ直す
  for (const group of groups) {
    sortLeagueMembers(group);
  }

  return groups;
}

export function generateRoundRobinRounds(entryIds: string[]) {
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

export function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function generateSeedOrder(size: number): number[] {
  if (size === 1) return [1];

  const prev = generateSeedOrder(size / 2);
  const result: number[] = [];

  for (const seed of prev) {
    result.push(seed);
    result.push(size + 1 - seed);
  }

  return result;
}

export function buildKnockoutFirstRound(entryIds: string[]) {
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
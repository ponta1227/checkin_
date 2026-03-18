export type TeamStandingEntry = {
  entryId: string;
  teamName: string;
  teamAffiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  teamPointsFor: number;
  teamPointsAgainst: number;
  teamPointDiff: number;
  gamePointsFor: number;
  gamePointsAgainst: number;
  gamePointDiff: number;
};

type MatchRow = {
  id: string;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string | null;
  league_group_no?: number | null;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_affiliation: string | null;
};

function parseTeamScore(scoreText: string | null) {
  if (!scoreText || !scoreText.includes("-")) {
    return { left: 0, right: 0 };
  }

  const [leftRaw, rightRaw] = String(scoreText).split("-");
  const left = Number(leftRaw);
  const right = Number(rightRaw);

  return {
    left: Number.isFinite(left) ? left : 0,
    right: Number.isFinite(right) ? right : 0,
  };
}

function buildStandingCore(params: {
  entries: EntryRow[];
  matches: MatchRow[];
}) {
  const { entries, matches } = params;

  const standingMap = new Map<string, TeamStandingEntry>();

  for (const entry of entries) {
    standingMap.set(entry.id, {
      entryId: entry.id,
      teamName: entry.entry_name ?? "-",
      teamAffiliation: entry.entry_affiliation ?? null,
      played: 0,
      wins: 0,
      losses: 0,
      teamPointsFor: 0,
      teamPointsAgainst: 0,
      teamPointDiff: 0,
      gamePointsFor: 0,
      gamePointsAgainst: 0,
      gamePointDiff: 0,
    });
  }

  for (const match of matches) {
    if (!match.player1_entry_id || !match.player2_entry_id) continue;
    if (match.status !== "completed") continue;

    const team1 = standingMap.get(match.player1_entry_id);
    const team2 = standingMap.get(match.player2_entry_id);
    if (!team1 || !team2) continue;

    const { left, right } = parseTeamScore(match.score_text);

    team1.played += 1;
    team2.played += 1;

    team1.teamPointsFor += left;
    team1.teamPointsAgainst += right;

    team2.teamPointsFor += right;
    team2.teamPointsAgainst += left;

    team1.gamePointsFor += left;
    team1.gamePointsAgainst += right;

    team2.gamePointsFor += right;
    team2.gamePointsAgainst += left;

    if (match.winner_entry_id === team1.entryId) {
      team1.wins += 1;
      team2.losses += 1;
    } else if (match.winner_entry_id === team2.entryId) {
      team2.wins += 1;
      team1.losses += 1;
    }
  }

  const standings = [...standingMap.values()].map((row) => ({
    ...row,
    teamPointDiff: row.teamPointsFor - row.teamPointsAgainst,
    gamePointDiff: row.gamePointsFor - row.gamePointsAgainst,
  }));

  standings.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (a.teamPointDiff !== b.teamPointDiff) return b.teamPointDiff - a.teamPointDiff;
    if (a.gamePointDiff !== b.gamePointDiff) return b.gamePointDiff - a.gamePointDiff;
    return a.teamName.localeCompare(b.teamName, "ja");
  });

  return standings.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));
}

export function buildTeamLeagueStandings(params: {
  entries: EntryRow[];
  matches: MatchRow[];
}) {
  return buildStandingCore(params);
}

export function buildTeamLeagueStandingsByGroup(params: {
  entries: EntryRow[];
  matches: MatchRow[];
}) {
  const { entries, matches } = params;

  const entriesById = new Map(entries.map((e) => [e.id, e]));
  const groups = new Map<number, { entries: EntryRow[]; matches: MatchRow[] }>();

  for (const match of matches) {
    const groupNo = Number(match.league_group_no ?? 1);
    if (!groups.has(groupNo)) {
      groups.set(groupNo, { entries: [], matches: [] });
    }
    groups.get(groupNo)!.matches.push(match);
  }

  for (const group of groups.values()) {
    const entryIds = new Set<string>();
    for (const match of group.matches) {
      if (match.player1_entry_id) entryIds.add(match.player1_entry_id);
      if (match.player2_entry_id) entryIds.add(match.player2_entry_id);
    }
    group.entries = [...entryIds]
      .map((id) => entriesById.get(id))
      .filter(Boolean) as EntryRow[];
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([groupNo, data]) => ({
      groupNo,
      standings: buildStandingCore({
        entries: data.entries,
        matches: data.matches,
      }),
    }));
}

export function splitStandingsIntoUpperLowerByGroup(params: {
  groupedStandings: Array<{
    groupNo: number;
    standings: Array<{ entryId: string }>;
  }>;
}) {
  const upperEntryIds: string[] = [];
  const lowerEntryIds: string[] = [];

  for (const group of params.groupedStandings) {
    const cut = Math.ceil(group.standings.length / 2);
    upperEntryIds.push(...group.standings.slice(0, cut).map((r) => r.entryId));
    lowerEntryIds.push(...group.standings.slice(cut).map((r) => r.entryId));
  }

  return { upperEntryIds, lowerEntryIds };
}

export function buildRankBucketsWithMerge(params: {
  groupedStandings: Array<{
    groupNo: number;
    standings: Array<{ rank: number; entryId: string }>;
  }>;
}) {
  const rankMap = new Map<number, string[]>();

  for (const group of params.groupedStandings) {
    for (const row of group.standings) {
      if (!rankMap.has(row.rank)) rankMap.set(row.rank, []);
      rankMap.get(row.rank)!.push(row.entryId);
    }
  }

  const ranks = [...rankMap.keys()].sort((a, b) => a - b);

  for (let i = ranks.length - 1; i > 0; i -= 1) {
    const rank = ranks[i];
    const prevRank = ranks[i - 1];
    const current = rankMap.get(rank) ?? [];

    if (current.length < 2) {
      const prev = rankMap.get(prevRank) ?? [];
      rankMap.set(prevRank, [...prev, ...current]);
      rankMap.delete(rank);
    }
  }

  return [...rankMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, entryIds]) => ({
      key: `rank_${rank}`,
      label: `${rank}位トーナメント`,
      entryIds,
    }));
}
type EntryMapValue = {
  id: string;
  players:
    | {
        id: string;
        name: string | null;
        affiliation: string | null;
      }
    | null;
};

type GroupMemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type LeagueMatchRow = {
  id: string;
  group_id: string;
  round_no: number;
  slot_no: number;
  match_no: number;
  table_no: string | null;
  player1_entry_id: string;
  player2_entry_id: string;
  referee_entry_id: string | null;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string;
};

export type StandingRow = {
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

export function buildStandings(params: {
  groupMembers: GroupMemberRow[];
  groupMatches: LeagueMatchRow[];
  entryMap: Map<string, EntryMapValue>;
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
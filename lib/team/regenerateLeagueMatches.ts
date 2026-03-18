type EditedGroup = {
  groupNo: number;
  entryIds: string[];
};

type GeneratedMatch = {
  division_id: string;
  bracket_id: null;
  league_group_no: number;
  round_no: number;
  match_no: number;
  player1_entry_id: string;
  player2_entry_id: string;
  winner_entry_id: null;
  status: string;
  score_text: null;
  table_no: number | null;
};

function rotateForRoundRobin<T>(arr: T[]) {
  if (arr.length <= 2) return arr;
  const fixed = arr[0];
  const rest = arr.slice(1);
  const last = rest.pop();
  if (last === undefined) return arr;
  return [fixed, last, ...rest];
}

function generateRoundRobinRounds(entryIds: string[]) {
  const needsBye = entryIds.length % 2 === 1;
  let arr: Array<string | null> = needsBye ? [...entryIds, null] : [...entryIds];

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

export async function regenerateTeamLeagueMatches(params: {
  supabase: any;
  divisionId: string;
  editedGroups: EditedGroup[];
}) {
  const { supabase, divisionId, editedGroups } = params;

  const { data: currentMatches, error: currentMatchesError } = await supabase
    .from("matches")
    .select("id, status")
    .eq("division_id", divisionId)
    .is("bracket_id", null);

  if (currentMatchesError) {
    throw new Error(`既存試合取得に失敗しました: ${currentMatchesError.message}`);
  }

  const hasStarted = (currentMatches ?? []).some(
    (m: { status: string | null }) =>
      m.status === "in_progress" || m.status === "completed"
  );

  if (hasStarted) {
    throw new Error("試合開始済みのリーグがあるため、組み合わせを変更できません。");
  }

  const groupNos = editedGroups.map((g) => g.groupNo);

  const { data: courtAssignments, error: courtError } = await supabase
    .from("division_league_court_assignments")
    .select("league_group_no, slot_no, court_no")
    .eq("division_id", divisionId)
    .in("league_group_no", groupNos)
    .order("slot_no", { ascending: true });

  if (courtError) {
    throw new Error(`コート割当取得に失敗しました: ${courtError.message}`);
  }

  const courtMap = new Map<number, number[]>();
  for (const row of courtAssignments ?? []) {
    if (!courtMap.has(row.league_group_no)) {
      courtMap.set(row.league_group_no, []);
    }
    courtMap.get(row.league_group_no)!.push(row.court_no);
  }

  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("division_id", divisionId)
    .is("bracket_id", null);

  if (deleteError) {
    throw new Error(`既存リーグ試合削除に失敗しました: ${deleteError.message}`);
  }

  const insertRows: GeneratedMatch[] = [];

  for (const group of editedGroups) {
    const rounds = generateRoundRobinRounds(group.entryIds);
    const assignedCourts = courtMap.get(group.groupNo) ?? [];
    const effectiveCourts = assignedCourts.length > 0 ? assignedCourts : [null];
    const courtCount = effectiveCourts.length;

    let slotNo = 1;
    let matchNo = 1;

    for (const roundPairs of rounds) {
      const actualPairs = roundPairs.filter(
        (pair) => pair.player1_entry_id && pair.player2_entry_id
      ) as Array<{ player1_entry_id: string; player2_entry_id: string }>;

      for (let start = 0; start < actualPairs.length; start += courtCount) {
        const batch = actualPairs.slice(start, start + courtCount);

        for (let i = 0; i < batch.length; i += 1) {
          insertRows.push({
            division_id: divisionId,
            bracket_id: null,
            league_group_no: group.groupNo,
            round_no: slotNo,
            match_no: matchNo,
            player1_entry_id: batch[i].player1_entry_id,
            player2_entry_id: batch[i].player2_entry_id,
            winner_entry_id: null,
            status: "pending",
            score_text: null,
            table_no: effectiveCourts[i],
          });
          matchNo += 1;
        }

        slotNo += 1;
      }
    }
  }

  if (insertRows.length > 0) {
    const { error: insertError } = await supabase
      .from("matches")
      .insert(insertRows);

    if (insertError) {
      throw new Error(`リーグ試合再生成に失敗しました: ${insertError.message}`);
    }
  }
}
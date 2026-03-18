type TeamMemberInput = {
  name: string;
  affiliation?: string | null;
  seed?: number | null;
  applicationRank?: number | null;
};

type ValidateTeamEntryParams = {
  eventType: string;
  teamName: string;
  teamAffiliation?: string | null;
  teamMembers: TeamMemberInput[];
  teamMemberRequired: boolean;
  teamMemberCountMin?: number | null;
  teamMemberCountMax?: number | null;
};

export function normalizeTeamMembers(teamMembers: TeamMemberInput[]) {
  return teamMembers
    .map((member) => ({
      name: String(member.name ?? "").trim(),
      affiliation: member.affiliation ? String(member.affiliation).trim() : null,
      seed:
        member.seed === null || member.seed === undefined || member.seed === ("" as any)
          ? null
          : Number(member.seed),
      applicationRank:
        member.applicationRank === null ||
        member.applicationRank === undefined ||
        member.applicationRank === ("" as any)
          ? null
          : Number(member.applicationRank),
    }))
    .filter((member) => member.name !== "");
}

export function validateTeamEntryInput(params: ValidateTeamEntryParams) {
  const {
    eventType,
    teamName,
    teamMembers,
    teamMemberRequired,
    teamMemberCountMin,
    teamMemberCountMax,
  } = params;

  if (eventType !== "team") {
    throw new Error("このAPIは団体戦専用です。");
  }

  if (!String(teamName ?? "").trim()) {
    throw new Error("チーム名は必須です。");
  }

  const normalizedMembers = normalizeTeamMembers(teamMembers);

  if (teamMemberRequired && normalizedMembers.length === 0) {
    throw new Error("この大会ではチームメンバー登録が必須です。");
  }

  if (
    teamMemberCountMin !== null &&
    teamMemberCountMin !== undefined &&
    normalizedMembers.length > 0 &&
    normalizedMembers.length < teamMemberCountMin
  ) {
    throw new Error(`チームメンバーは最低 ${teamMemberCountMin} 名必要です。`);
  }

  if (
    teamMemberCountMax !== null &&
    teamMemberCountMax !== undefined &&
    normalizedMembers.length > teamMemberCountMax
  ) {
    throw new Error(`チームメンバーは最大 ${teamMemberCountMax} 名までです。`);
  }

  const seenNames = new Set<string>();
  for (const member of normalizedMembers) {
    if (seenNames.has(member.name)) {
      throw new Error(`同じメンバー名が重複しています: ${member.name}`);
    }
    seenNames.add(member.name);

    if (member.seed !== null && !Number.isInteger(member.seed)) {
      throw new Error(`メンバー seed が不正です: ${member.name}`);
    }
    if (
      member.applicationRank !== null &&
      !Number.isInteger(member.applicationRank)
    ) {
      throw new Error(`メンバー申込順位が不正です: ${member.name}`);
    }
  }

  return normalizedMembers;
}
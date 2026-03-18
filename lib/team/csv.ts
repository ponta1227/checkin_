export type TeamCsvRow = {
  teamName: string;
  affiliation: string | null;
  seed: number | null;
  applicationRank: number | null;
  members: Array<{
    name: string;
    affiliation: string | null;
    seed: number | null;
    applicationRank: number | null;
  }>;
};

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((v) => v.trim());
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function toNullableInt(value: string | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isInteger(num)) {
    throw new Error(`数値項目が不正です: ${raw}`);
  }
  return num;
}

function getValueByHeader(
  headers: string[],
  values: string[],
  names: string[]
) {
  for (const name of names) {
    const idx = headers.indexOf(normalizeHeader(name));
    if (idx >= 0) return values[idx] ?? "";
  }
  return "";
}

export function parseTeamCsv(text: string): TeamCsvRow[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (rawLines.length === 0) {
    throw new Error("CSVが空です。");
  }

  const headers = splitCsvLine(rawLines[0]).map(normalizeHeader);

  const teamNameHeader = getValueByHeader(headers, headers, [
    "team_name",
    "teamname",
    "チーム名",
  ]);

  if (!teamNameHeader) {
    throw new Error("CSVヘッダーに team_name または チーム名 が必要です。");
  }

  const rows: TeamCsvRow[] = [];

  for (let lineIndex = 1; lineIndex < rawLines.length; lineIndex += 1) {
    const line = rawLines[lineIndex];
    const values = splitCsvLine(line);

    const teamName = getValueByHeader(headers, values, [
      "team_name",
      "teamname",
      "チーム名",
    ]).trim();

    if (!teamName) {
      throw new Error(`${lineIndex + 1}行目: チーム名が空です。`);
    }

    const affiliation =
      getValueByHeader(headers, values, ["affiliation", "所属"]).trim() || null;

    const seed = toNullableInt(
      getValueByHeader(headers, values, ["seed", "シード"])
    );

    const applicationRank = toNullableInt(
      getValueByHeader(headers, values, [
        "application_rank",
        "applicationrank",
        "申込順位",
      ])
    );

    const members: TeamCsvRow["members"] = [];

    for (let i = 1; i <= 8; i += 1) {
      const memberName = getValueByHeader(headers, values, [
        `member${i}`,
        `member_${i}`,
        `メンバー${i}`,
      ]).trim();

      const memberAffiliation =
        getValueByHeader(headers, values, [
          `member${i}_affiliation`,
          `member_${i}_affiliation`,
          `member${i}所属`,
          `メンバー${i}所属`,
        ]).trim() || null;

      const memberSeed = toNullableInt(
        getValueByHeader(headers, values, [
          `member${i}_seed`,
          `member_${i}_seed`,
          `member${i}seed`,
          `メンバー${i}seed`,
        ])
      );

      const memberApplicationRank = toNullableInt(
        getValueByHeader(headers, values, [
          `member${i}_application_rank`,
          `member_${i}_application_rank`,
          `member${i}申込順位`,
          `メンバー${i}申込順位`,
        ])
      );

      if (memberName) {
        members.push({
          name: memberName,
          affiliation: memberAffiliation,
          seed: memberSeed,
          applicationRank: memberApplicationRank,
        });
      }
    }

    rows.push({
      teamName,
      affiliation,
      seed,
      applicationRank,
      members,
    });
  }

  return rows;
}
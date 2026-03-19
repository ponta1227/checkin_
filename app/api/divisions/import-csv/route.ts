import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRecord = {
  name: string;
  kana: string | null;
  affiliation: string | null;
  rating: number | null;
  seed: number | null;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  affiliation_order: number | null;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/_/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseNullableInteger(value: string, lineNo: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const num = Number(trimmed);
  if (!Number.isInteger(num)) {
    throw new Error(`invalid_number_${lineNo}`);
  }

  return num;
}

function getValue(row: string[], headerIndexMap: Map<string, number>, keys: string[]) {
  for (const key of keys) {
    const idx = headerIndexMap.get(key);
    if (idx !== undefined) {
      return (row[idx] ?? "").trim();
    }
  }
  return "";
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "unknown error";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const csvFile = formData.get("csvFile");

    if (!tournamentId || !divisionId) {
      return Response.json(
        { ok: false, error: "upload_failed", error_detail: "必要なIDが不足しています。" },
        { status: 400 }
      );
    }

    if (!(csvFile instanceof File)) {
      return Response.json(
        { ok: false, error: "missing_file" },
        { status: 400 }
      );
    }

    const rawText = await csvFile.text();
    const text = rawText.replace(/^\uFEFF/, "");

    if (!text.trim()) {
      return Response.json(
        { ok: false, error: "empty_csv" },
        { status: 400 }
      );
    }

    const rows = parseCsv(text);

    if (rows.length < 2) {
      return Response.json(
        { ok: false, error: "empty_csv" },
        { status: 400 }
      );
    }

    const headers = rows[0].map(normalizeHeader);
    const headerIndexMap = new Map<string, number>();
    headers.forEach((header, index) => {
      headerIndexMap.set(header, index);
    });

    const nameHeaderExists =
      headerIndexMap.has("name") ||
      headerIndexMap.has("氏名") ||
      headerIndexMap.has("名前");

    if (!nameHeaderExists) {
      return Response.json(
        { ok: false, error: "missing_name_header" },
        { status: 400 }
      );
    }

    const parsedRecords: ParsedRecord[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const lineNo = i + 1;

      const name = getValue(row, headerIndexMap, ["name", "氏名", "名前"]);
      const kana = getValue(row, headerIndexMap, ["kana", "ふりがな", "フリガナ", "かな"]);
      const affiliation = getValue(row, headerIndexMap, ["affiliation", "所属"]);
      const ratingRaw = getValue(row, headerIndexMap, ["rating", "レーティング"]);
      const seedRaw = getValue(row, headerIndexMap, ["seed", "シード"]);
      const entryRatingRaw = getValue(row, headerIndexMap, [
        "entryrating",
        "組合せレーティング",
        "組み合わせレーティング",
        "組合r",
        "組み合わせr",
      ]);
      const rankingForDrawRaw = getValue(row, headerIndexMap, [
        "rankingfordraw",
        "ranking_for_draw",
        "組み合わせ順位",
        "組合せ順位",
        "抽選順位",
      ]);
      const affiliationOrderRaw = getValue(row, headerIndexMap, [
        "affiliationorder",
        "affiliation_order",
        "所属内順位",
      ]);

      if (!name) {
        return Response.json(
          { ok: false, error: `invalid_row_${lineNo}` },
          { status: 400 }
        );
      }

      try {
        parsedRecords.push({
          name,
          kana: kana || null,
          affiliation: affiliation || null,
          rating: parseNullableInteger(ratingRaw, lineNo),
          seed: parseNullableInteger(seedRaw, lineNo),
          entry_rating: parseNullableInteger(entryRatingRaw, lineNo),
          ranking_for_draw: parseNullableInteger(rankingForDrawRaw, lineNo),
          affiliation_order: parseNullableInteger(affiliationOrderRaw, lineNo),
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("invalid_number_")) {
          return Response.json(
            { ok: false, error: error.message },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const supabase = await createSupabaseServerClient();

    let playersCreated = 0;
    let playersReused = 0;
    let entriesCreated = 0;
    let entriesSkipped = 0;

    for (const record of parsedRecords) {
      let playerId = "";

      let playerQuery = supabase
        .from("players")
        .select("id")
        .eq("name", record.name);

      playerQuery = record.kana
        ? playerQuery.eq("kana", record.kana)
        : playerQuery.is("kana", null);

      playerQuery = record.affiliation
        ? playerQuery.eq("affiliation", record.affiliation)
        : playerQuery.is("affiliation", null);

      const { data: existingPlayers, error: existingPlayersError } = await playerQuery.limit(1);

      if (existingPlayersError) {
        throw new Error(`players検索失敗: ${existingPlayersError.message}`);
      }

      if (existingPlayers && existingPlayers.length > 0) {
        playerId = existingPlayers[0].id;
        playersReused += 1;
      } else {
        const { data: insertedPlayer, error: insertPlayerError } = await supabase
          .from("players")
          .insert({
            name: record.name,
            kana: record.kana,
            affiliation: record.affiliation,
            rating: record.rating ?? 1500,
          })
          .select("id")
          .single();

        if (insertPlayerError || !insertedPlayer) {
          throw new Error(`players追加失敗: ${insertPlayerError?.message ?? "unknown"}`);
        }

        playerId = insertedPlayer.id;
        playersCreated += 1;
      }

      const { data: existingEntries, error: existingEntriesError } = await supabase
        .from("entries")
        .select("id")
        .eq("division_id", divisionId)
        .eq("player_id", playerId)
        .limit(1);

      if (existingEntriesError) {
        throw new Error(`entries検索失敗: ${existingEntriesError.message}`);
      }

      if (existingEntries && existingEntries.length > 0) {
        entriesSkipped += 1;
        continue;
      }

      const { data: insertedEntry, error: insertEntryError } = await supabase
        .from("entries")
        .insert({
          division_id: divisionId,
          player_id: playerId,
          status: "entered",
          seed: record.seed,
          entry_rating: record.entry_rating ?? record.rating ?? null,
          ranking_for_draw: record.ranking_for_draw,
          affiliation_order: record.affiliation_order,
        })
        .select("id")
        .single();

      if (insertEntryError || !insertedEntry) {
        throw new Error(`entries追加失敗: ${insertEntryError?.message ?? "unknown"}`);
      }

     const { data: existingCheckins, error: existingCheckinsError } = await supabase
        .from("checkins")
        .select("id")
        .eq("entry_id", insertedEntry.id)
        .limit(1);

      if (existingCheckinsError) {
        throw new Error(`checkins検索失敗: ${existingCheckinsError.message}`);
      }

      if (!existingCheckins || existingCheckins.length === 0) {
        const { error: insertCheckinError } = await supabase
          .from("checkins")
          .insert({
            entry_id: insertedEntry.id,
            status: "pending",
          });

        if (insertCheckinError) {
          throw new Error(`checkins追加失敗: ${insertCheckinError.message}`);
        }
      }

      entriesCreated += 1;
    }

    return Response.json({
      ok: true,
      players_created: playersCreated,
      players_reused: playersReused,
      entries_created: entriesCreated,
      entries_skipped: entriesSkipped,
    });
  } catch (error) {
    console.error("CSV import failed:", error);

    return Response.json(
      {
        ok: false,
        error: "upload_failed",
        error_detail: safeErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
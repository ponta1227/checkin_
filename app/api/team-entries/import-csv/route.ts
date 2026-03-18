import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTeamCsv } from "@/lib/team/csv";
import { validateTeamEntryInput } from "@/lib/team/validate";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const file = formData.get("csvFile");

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    if (!(file instanceof File)) {
      return new Response("CSVファイルが選択されていません。", { status: 400 });
    }

    const csvText = await file.text();
    if (!csvText.trim()) {
      return new Response("CSVファイルが空です。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select(`
        id,
        event_type,
        team_member_required,
        team_member_count_min,
        team_member_count_max
      `)
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(
        `種目取得に失敗しました: ${divisionError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    if (division.event_type !== "team") {
      return new Response("この種目は団体戦ではありません。", { status: 400 });
    }

    const rows = parseTeamCsv(csvText);

    let createdCount = 0;
    let memberCreatedCount = 0;

    for (const row of rows) {
      const normalizedMembers = validateTeamEntryInput({
        eventType: division.event_type,
        teamName: row.teamName,
        teamAffiliation: row.affiliation,
        teamMembers: row.members.map((member) => ({
          name: member.name,
          affiliation: member.affiliation,
          seed: member.seed,
          applicationRank: member.applicationRank,
        })),
        teamMemberRequired: division.team_member_required ?? false,
        teamMemberCountMin: division.team_member_count_min,
        teamMemberCountMax: division.team_member_count_max,
      });

      const memberNames = normalizedMembers
        .map((member) => member.name?.trim() ?? "")
        .filter((name) => name.length > 0);

      const { data: insertedEntry, error: insertEntryError } = await supabase
        .from("entries")
        .insert({
          division_id: divisionId,
          player_id: null,
          entry_name: row.teamName,
          entry_affiliation: row.affiliation,
          ranking_for_draw: row.seed,
          affiliation_order: row.applicationRank,
          status: "entered",
          team_members: memberNames,
        })
        .select("id")
        .single();

      if (insertEntryError || !insertedEntry) {
        throw new Error(
          `団体エントリー作成に失敗しました（${row.teamName}）: ${insertEntryError?.message ?? "unknown"}`
        );
      }

      createdCount += 1;

      if (normalizedMembers.length > 0) {
        const memberRows = normalizedMembers.map((member, index) => ({
          entry_id: insertedEntry.id,
          name: member.name,
          affiliation: member.affiliation ?? null,
          seed: member.seed ?? null,
          application_rank: member.applicationRank ?? null,
          member_order: index + 1,
        }));

        const { error: memberInsertError } = await supabase
          .from("team_members")
          .insert(memberRows);

        if (memberInsertError) {
          await supabase.from("entries").delete().eq("id", insertedEntry.id);
          throw new Error(
            `チームメンバー登録に失敗しました（${row.teamName}）: ${memberInsertError.message}`
          );
        }

        memberCreatedCount += memberRows.length;
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount,
      memberCreatedCount,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体戦CSV取込に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
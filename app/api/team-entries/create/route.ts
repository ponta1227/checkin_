import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateTeamEntryInput } from "@/lib/team/validate";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const divisionId = String(formData.get("divisionId") ?? "");
    const tournamentId = String(formData.get("tournamentId") ?? "");
    const teamName = String(formData.get("teamName") ?? "").trim();
    const teamAffiliationRaw = String(formData.get("teamAffiliation") ?? "").trim();
    const seedRaw = String(formData.get("seed") ?? "").trim();
    const applicationRankRaw = String(formData.get("applicationRank") ?? "").trim();
    const teamMembersRaw = String(formData.get("teamMembersJson") ?? "[]");

    if (!divisionId || !tournamentId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

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

    let parsedMembers: any[] = [];
    try {
      parsedMembers = JSON.parse(teamMembersRaw);
      if (!Array.isArray(parsedMembers)) parsedMembers = [];
    } catch {
      return new Response("チームメンバーJSONの形式が不正です。", { status: 400 });
    }

    const normalizedMembers = validateTeamEntryInput({
      eventType: division.event_type,
      teamName,
      teamAffiliation: teamAffiliationRaw || null,
      teamMembers: parsedMembers,
      teamMemberRequired: division.team_member_required ?? false,
      teamMemberCountMin: division.team_member_count_min,
      teamMemberCountMax: division.team_member_count_max,
    });

    const seed =
      seedRaw === "" ? null : Number(seedRaw);
    const applicationRank =
      applicationRankRaw === "" ? null : Number(applicationRankRaw);

    if (seed !== null && !Number.isInteger(seed)) {
      return new Response("seed が不正です。", { status: 400 });
    }

    if (applicationRank !== null && !Number.isInteger(applicationRank)) {
      return new Response("申込順位が不正です。", { status: 400 });
    }

    const { data: insertedEntry, error: insertEntryError } = await supabase
      .from("entries")
      .insert({
        division_id: divisionId,
        player_id: null,
        entry_name: teamName,
        entry_affiliation: teamAffiliationRaw || null,
        ranking_for_draw: seed,
        affiliation_order: applicationRank,
        status: "entered",
      })
      .select("id")
      .single();

    if (insertEntryError || !insertedEntry) {
      return new Response(
        `団体エントリー作成に失敗しました: ${insertEntryError?.message ?? "unknown"}`,
        { status: 500 }
      );
    }

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
        return new Response(
          `チームメンバー登録に失敗しました: ${memberInsertError.message}`,
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      entryId: insertedEntry.id,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体エントリー作成に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
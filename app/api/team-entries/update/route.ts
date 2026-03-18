import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateTeamEntryInput } from "@/lib/team/validate";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const divisionId = String(formData.get("divisionId") ?? "");
    const entryId = String(formData.get("entryId") ?? "");
    const teamName = String(formData.get("teamName") ?? "").trim();
    const teamAffiliationRaw = String(formData.get("teamAffiliation") ?? "").trim();
    const seedRaw = String(formData.get("seed") ?? "").trim();
    const applicationRankRaw = String(formData.get("applicationRank") ?? "").trim();
    const teamMembersRaw = String(formData.get("teamMembersJson") ?? "[]");

    if (!divisionId || !entryId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
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

    const { error: updateEntryError } = await supabase
      .from("entries")
      .update({
        entry_name: teamName,
        entry_affiliation: teamAffiliationRaw || null,
        ranking_for_draw: seed,
        affiliation_order: applicationRank,
      })
      .eq("id", entryId)
      .eq("division_id", divisionId);

    if (updateEntryError) {
      return new Response(
        `団体エントリー更新に失敗しました: ${updateEntryError.message}`,
        { status: 500 }
      );
    }

    const { error: deleteMembersError } = await supabase
      .from("team_members")
      .delete()
      .eq("entry_id", entryId);

    if (deleteMembersError) {
      return new Response(
        `既存メンバー削除に失敗しました: ${deleteMembersError.message}`,
        { status: 500 }
      );
    }

    if (normalizedMembers.length > 0) {
      const memberRows = normalizedMembers.map((member, index) => ({
        entry_id: entryId,
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
        return new Response(
          `チームメンバー更新に失敗しました: ${memberInsertError.message}`,
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      entryId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体エントリー更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
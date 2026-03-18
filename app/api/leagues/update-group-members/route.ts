import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { regenerateGroupMatches } from "@/lib/league/regenerateGroupMatches";

type EditedGroup = {
  groupId: string;
  entryIds: string[];
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const editedGroupsRaw = formData.get("editedGroups")?.toString() ?? "[]";

    if (!tournamentId || !divisionId) {
      return new NextResponse("必要なIDが不足しています。", { status: 400 });
    }

    const editedGroups = JSON.parse(editedGroupsRaw) as EditedGroup[];

    if (!Array.isArray(editedGroups) || editedGroups.length === 0) {
      return new NextResponse("編集内容がありません。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const targetGroupIds = editedGroups.map((g) => g.groupId);

    const { data: currentMatches, error: matchesError } = await supabase
      .from("league_matches")
      .select("id, group_id, status")
      .in("group_id", targetGroupIds);

    if (matchesError) {
      return new NextResponse(`試合状況取得に失敗しました: ${matchesError.message}`, {
        status: 500,
      });
    }

    const hasStarted = (currentMatches ?? []).some(
      (m) => m.status === "in_progress" || m.status === "completed"
    );

    if (hasStarted) {
      return new NextResponse(
        "対象リーグに試合開始済みのものがあるため、組み合わせを変更できません。",
        { status: 400 }
      );
    }

    const { data: currentMembers, error: membersError } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", targetGroupIds);

    if (membersError) {
      return new NextResponse(`リーグメンバー取得に失敗しました: ${membersError.message}`, {
        status: 500,
      });
    }

    const memberRowByEntryId = new Map<string, { id: string; group_id: string; entry_id: string }>();
    for (const row of currentMembers ?? []) {
      memberRowByEntryId.set(row.entry_id, row);
    }

    const allEntryIds = editedGroups.flatMap((g) => g.entryIds);
    const uniqueEntryIds = new Set(allEntryIds);

    if (allEntryIds.length !== uniqueEntryIds.size) {
      return new NextResponse("同じチームが重複して配置されています。", { status: 400 });
    }

    for (const entryId of allEntryIds) {
      if (!memberRowByEntryId.has(entryId)) {
        return new NextResponse(`不正なチームが含まれています: ${entryId}`, {
          status: 400,
        });
      }
    }

    for (const group of editedGroups) {
      for (let i = 0; i < group.entryIds.length; i += 1) {
        const entryId = group.entryIds[i];
        const memberRow = memberRowByEntryId.get(entryId);

        if (!memberRow) {
          return new NextResponse(`メンバー情報が見つかりません: ${entryId}`, {
            status: 400,
          });
        }

        const { error: updateError } = await supabase
          .from("league_group_members")
          .update({
            group_id: group.groupId,
            slot_no: i + 1,
          })
          .eq("id", memberRow.id);

        if (updateError) {
          return new NextResponse(`リーグメンバー更新に失敗しました: ${updateError.message}`, {
            status: 500,
          });
        }
      }
    }

    for (const group of editedGroups) {
      await regenerateGroupMatches({
        supabase,
        groupId: group.groupId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ編集保存に失敗しました。";
    return new NextResponse(message, { status: 500 });
  }
}
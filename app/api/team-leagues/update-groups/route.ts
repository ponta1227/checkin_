import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { regenerateTeamLeagueMatches } from "@/lib/team/regenerateLeagueMatches";

type EditedGroup = {
  groupNo: number;
  entryIds: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tournamentId?: string;
      divisionId?: string;
      editedGroups?: EditedGroup[];
    };

    const tournamentId = body.tournamentId ?? "";
    const divisionId = body.divisionId ?? "";
    const editedGroups = body.editedGroups ?? [];

    if (!tournamentId || !divisionId) {
      return new NextResponse("必要なIDが不足しています。", { status: 400 });
    }

    if (!Array.isArray(editedGroups) || editedGroups.length === 0) {
      return new NextResponse("編集データがありません。", { status: 400 });
    }

    const allEntryIds = editedGroups.flatMap((g) => g.entryIds);
    const uniqueEntryIds = new Set(allEntryIds);

    if (allEntryIds.length !== uniqueEntryIds.size) {
      return new NextResponse("同じチームが重複して配置されています。", {
        status: 400,
      });
    }

    const supabase = createSupabaseServerClient();

    await regenerateTeamLeagueMatches({
      supabase,
      divisionId,
      editedGroups,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ編集保存に失敗しました。";
    return new NextResponse(message, { status: 500 });
  }
}
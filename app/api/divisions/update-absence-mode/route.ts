import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const absenceHandlingMode =
      formData.get("absenceHandlingMode")?.toString() ?? "keep_walkover";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    if (
      absenceHandlingMode !== "keep_walkover" &&
      absenceHandlingMode !== "auto_repair"
    ) {
      return new Response("不正なモードです。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("divisions")
      .update({ absence_handling_mode: absenceHandlingMode })
      .eq("id", divisionId);

    if (error) {
      return new Response(`更新に失敗しました: ${error.message}`, { status: 500 });
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket?mode_updated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const leagueKnockoutMode =
      formData.get("leagueKnockoutMode")?.toString() ?? "by_rank";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    if (leagueKnockoutMode !== "by_rank" && leagueKnockoutMode !== "upper_lower") {
      return new Response("不正なモードです。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("divisions")
      .update({ league_knockout_mode: leagueKnockoutMode })
      .eq("id", divisionId);

    if (error) {
      return new Response(`更新に失敗しました: ${error.message}`, { status: 500 });
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league-knockout?mode_updated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "設定更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { regenerateMainBracket } from "@/lib/brackets/regenerateMainBracket";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const result = await regenerateMainBracket(supabase, divisionId);

    if (!result.ok && result.reason === "need_two_players") {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket?error=need_two_players`,
          request.url
        )
      );
    }

    if (!result.ok && result.reason === "has_completed_results") {
      return NextResponse.redirect(
        new URL(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket?error=has_completed_results`,
          request.url
        )
      );
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket?generated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "組み合わせ生成に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
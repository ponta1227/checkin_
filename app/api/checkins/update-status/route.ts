import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { regenerateMainBracket } from "@/lib/brackets/regenerateMainBracket";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const entryId = formData.get("entryId")?.toString() ?? "";
    const nextStatus = formData.get("nextStatus")?.toString() ?? "";

    if (!tournamentId || !divisionId || !entryId || !nextStatus) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (
      nextStatus !== "checked_in" &&
      nextStatus !== "pending" &&
      nextStatus !== "withdrawn"
    ) {
      return new Response("不正なステータスです。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: existingCheckin } = await supabase
      .from("checkins")
      .select("id")
      .eq("entry_id", entryId)
      .maybeSingle();

    if (existingCheckin?.id) {
      const { error } = await supabase
        .from("checkins")
        .update({ status: nextStatus })
        .eq("id", existingCheckin.id);

      if (error) {
        return new Response(`checkins更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    } else {
      const { error } = await supabase
        .from("checkins")
        .insert({
          entry_id: entryId,
          status: nextStatus,
        });

      if (error) {
        return new Response(`checkins追加に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    }

    const { data: division } = await supabase
      .from("divisions")
      .select("absence_handling_mode")
      .eq("id", divisionId)
      .single();

    if (nextStatus === "withdrawn" && division?.absence_handling_mode === "auto_repair") {
      await regenerateMainBracket(supabase, divisionId);
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/checkin?updated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "受付更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
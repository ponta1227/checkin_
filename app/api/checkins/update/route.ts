import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();

  const tournamentId = formData.get("tournamentId")?.toString() ?? "";
  const divisionId = formData.get("divisionId")?.toString() ?? "";
  const entryId = formData.get("entryId")?.toString() ?? "";
  const nextStatus = formData.get("nextStatus")?.toString() ?? "";

  if (!tournamentId || !divisionId || !entryId) {
    return new Response("必要なIDが不足しています。", { status: 400 });
  }

  if (!["pending", "checked_in", "withdrawn"].includes(nextStatus)) {
    return new Response("不正な受付状態です。", { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const checkedInAt = nextStatus === "checked_in" ? new Date().toISOString() : null;

  const { data: existingCheckin } = await supabase
    .from("checkins")
    .select("id")
    .eq("entry_id", entryId)
    .maybeSingle();

  if (existingCheckin?.id) {
    const { error } = await supabase
      .from("checkins")
      .update({
        status: nextStatus,
        checked_in_at: checkedInAt,
      })
      .eq("entry_id", entryId);

    if (error) {
      return new Response(`受付状態の更新に失敗しました: ${error.message}`, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("checkins").insert({
      entry_id: entryId,
      status: nextStatus,
      checked_in_at: checkedInAt,
    });

    if (error) {
      return new Response(`受付状態の作成に失敗しました: ${error.message}`, { status: 500 });
    }
  }

  return NextResponse.redirect(
    new URL(
      `/admin/tournaments/${tournamentId}/divisions/${divisionId}/checkin`,
      request.url
    )
  );
}
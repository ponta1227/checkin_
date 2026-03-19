import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const divisionId = String(body.divisionId ?? "");
    const entryId = String(body.entryId ?? "");

    if (!divisionId || !entryId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    await supabase
      .from("entries")
      .update({ status: "withdrawn" })
      .eq("id", entryId)
      .eq("division_id", divisionId);

    const { data: existingCheckin } = await supabase
      .from("checkins")
      .select("id")
      .eq("entry_id", entryId)
      .maybeSingle();

    if (existingCheckin?.id) {
      await supabase
        .from("checkins")
        .update({ status: "withdrawn" })
        .eq("id", existingCheckin.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "棄権処理に失敗しました。",
      { status: 500 }
    );
  }
}
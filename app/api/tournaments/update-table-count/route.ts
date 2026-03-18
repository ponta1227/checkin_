import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const returnPath = String(formData.get("returnPath") ?? "");
    const tableCount = Number(formData.get("tableCount") ?? "0");

    if (!tournamentId) {
      return new Response("tournamentId が不足しています。", { status: 400 });
    }

    if (!Number.isInteger(tableCount) || tableCount < 0) {
      return new Response("使用台数は0以上の整数で入力してください。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("tournaments")
      .update({ table_count: tableCount })
      .eq("id", tournamentId);

    if (error) {
      return new Response(`使用台数更新に失敗しました: ${error.message}`, {
        status: 500,
      });
    }

    return NextResponse.redirect(new URL(returnPath || "/", request.url));
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "使用台数更新に失敗しました。",
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const returnPath = String(formData.get("returnPath") ?? "/");

    if (!tournamentId || !divisionId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("divisions")
      .update({ public_access_token: token })
      .eq("id", divisionId);

    if (error) {
      return new Response(`公開トークン更新に失敗しました: ${error.message}`, {
        status: 500,
      });
    }

    return NextResponse.redirect(new URL(returnPath, request.url));
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "公開トークン更新に失敗しました。",
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const divisionId = String(body.divisionId ?? "");
    const matchId = String(body.matchId ?? "");
    const side = String(body.side ?? "");
    const orderLines = Array.isArray(body.orderLines) ? body.orderLines : [];

    if (!divisionId || !matchId || (side !== "team1" && side !== "team2")) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: match } = await supabase
      .from("matches")
      .select("id, player1_entry_id, player2_entry_id")
      .eq("id", matchId)
      .eq("division_id", divisionId)
      .single();

    if (!match) {
      return new Response("試合が見つかりません。", { status: 404 });
    }

    const entryId = side === "team1" ? match.player1_entry_id : match.player2_entry_id;
    if (!entryId) {
      return new Response("対象チームが確定していません。", { status: 400 });
    }

    const { data: existingOrder } = await supabase
      .from("team_match_orders")
      .select("id")
      .eq("team_match_id", matchId)
      .eq("entry_id", entryId)
      .maybeSingle();

    let orderId = existingOrder?.id ?? null;

    if (!orderId) {
      const { data: inserted } = await supabase
        .from("team_match_orders")
        .insert({
          team_match_id: matchId,
          entry_id: entryId,
          is_locked: true,
        })
        .select("id")
        .single();

      orderId = inserted?.id ?? null;
    } else {
      await supabase
        .from("team_match_orders")
        .update({ is_locked: true })
        .eq("id", orderId);

      await supabase
        .from("team_match_order_lines")
        .delete()
        .eq("team_match_order_id", orderId);
    }

    if (!orderId) {
      return new Response("オーダー保存に失敗しました。", { status: 500 });
    }

    const rows = orderLines
      .filter((row: any) => row.playerName)
      .map((row: any) => ({
        team_match_order_id: orderId,
        board_no: Number(row.boardNo),
        player_name: String(row.playerName),
      }));

    if (rows.length > 0) {
      await supabase.from("team_match_order_lines").insert(rows);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "オーダー提出に失敗しました。",
      { status: 500 }
    );
  }
}
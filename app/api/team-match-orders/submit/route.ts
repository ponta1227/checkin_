import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamMatchBoards } from "@/lib/team/buildTeamMatchBoards";
import { validateInitialOrderSelections } from "@/lib/team/order";

type SelectionPayload = {
  boardNo: number;
  matchType: "W" | "S" | "T";
  memberIds: string[];
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const matchId = String(formData.get("matchId") ?? "");
    const teamChoice = String(formData.get("teamChoice") ?? "");
    const confirmed = String(formData.get("confirmed") ?? "") === "true";
    const reconfirmed = String(formData.get("reconfirmed") ?? "") === "true";
    const selectionsJson = String(formData.get("selectionsJson") ?? "[]");

    if (!tournamentId || !divisionId || !matchId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (teamChoice !== "team1" && teamChoice !== "team2") {
      return new Response("チーム選択が不正です。", { status: 400 });
    }

    if (!confirmed || !reconfirmed) {
      return new Response("確認チェックが完了していません。", { status: 400 });
    }

    let selections: SelectionPayload[] = [];
    try {
      const parsed = JSON.parse(selectionsJson);
      if (!Array.isArray(parsed)) {
        return new Response("オーダー形式が不正です。", { status: 400 });
      }
      selections = parsed;
    } catch {
      return new Response("オーダーJSONの形式が不正です。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, event_type, team_match_format")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(
        `種目取得に失敗しました: ${divisionError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    if (division.event_type !== "team") {
      return new Response("このAPIは団体戦専用です。", { status: 400 });
    }

    const format = String(division.team_match_format ?? "");
    if (!format) {
      return new Response("団体戦形式が未設定です。", { status: 400 });
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select(`
        id,
        division_id,
        player1_entry_id,
        player2_entry_id
      `)
      .eq("id", matchId)
      .eq("division_id", divisionId)
      .single();

    if (matchError || !match) {
      return new Response(
        `試合取得に失敗しました: ${matchError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    const entryId =
      teamChoice === "team1" ? match.player1_entry_id : match.player2_entry_id;

    if (!entryId) {
      return new Response("対象チームが未確定です。", { status: 400 });
    }

    const { data: teamMembers, error: membersError } = await supabase
      .from("team_members")
      .select("id, entry_id, name")
      .eq("entry_id", entryId)
      .order("member_order", { ascending: true });

    if (membersError) {
      return new Response(`チームメンバー取得に失敗しました: ${membersError.message}`, {
        status: 500,
      });
    }

    const validMemberIds = new Set((teamMembers ?? []).map((m) => m.id));

    for (const selection of selections) {
      for (const memberId of selection.memberIds ?? []) {
        if (!validMemberIds.has(memberId)) {
          return new Response("自チームに属さないメンバーが選択されています。", {
            status: 400,
          });
        }
      }
    }

    validateInitialOrderSelections({
      format,
      selections,
    });

    const boards = buildTeamMatchBoards(format);
    const requiredBoards = boards.filter((b) => b.requiredAtInitialOrder);

    const orderJson = requiredBoards.map((board) => {
      const selection = selections.find((s) => s.boardNo === board.boardNo)!;
      return {
        boardNo: board.boardNo,
        matchType: board.type,
        memberIds: selection.memberIds,
      };
    });

    const { data: existingOrder } = await supabase
      .from("team_match_orders")
      .select("id, is_locked")
      .eq("team_match_id", matchId)
      .eq("entry_id", entryId)
      .maybeSingle();

    if (existingOrder?.is_locked) {
      return new Response("このチームの初回オーダーはすでに提出済みです。", {
        status: 400,
      });
    }

    let orderId = existingOrder?.id ?? null;

    if (!orderId) {
      const { data: insertedOrder, error: orderInsertError } = await supabase
        .from("team_match_orders")
        .insert({
          team_match_id: matchId,
          entry_id: entryId,
          submitted_at: new Date().toISOString(),
          is_locked: true,
          order_json: orderJson,
        })
        .select("id")
        .single();

      if (orderInsertError || !insertedOrder) {
        return new Response(
          `オーダー作成に失敗しました: ${orderInsertError?.message ?? "unknown"}`,
          { status: 500 }
        );
      }

      orderId = insertedOrder.id;
    } else {
      const { error: orderUpdateError } = await supabase
        .from("team_match_orders")
        .update({
          submitted_at: new Date().toISOString(),
          is_locked: true,
          order_json: orderJson,
        })
        .eq("id", orderId);

      if (orderUpdateError) {
        return new Response(`オーダー更新に失敗しました: ${orderUpdateError.message}`, {
          status: 500,
        });
      }

      await supabase
        .from("team_match_order_lines")
        .delete()
        .eq("team_match_order_id", orderId);
    }

    const lineRows = requiredBoards.map((board) => {
      const selection = selections.find((s) => s.boardNo === board.boardNo)!;
      const memberIds = selection.memberIds ?? [];

      return {
        team_match_order_id: orderId,
        board_no: board.boardNo,
        match_type: board.type,
        member1_id: memberIds[0] ?? null,
        member2_id: memberIds[1] ?? null,
        member3_id: null,
        member4_id: null,
      };
    });

    const { error: lineInsertError } = await supabase
      .from("team_match_order_lines")
      .insert(lineRows);

    if (lineInsertError) {
      return new Response(`オーダー明細保存に失敗しました: ${lineInsertError.message}`, {
        status: 500,
      });
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${matchId}/team-order?team=${teamChoice}&submitted=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "オーダー提出に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
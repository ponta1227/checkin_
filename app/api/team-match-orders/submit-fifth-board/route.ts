import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countTeamWinsAfterBoard4, validateFifthBoardSelection } from "@/lib/team/order";
import { buildTeamMatchBoards } from "@/lib/team/buildTeamMatchBoards";

type FifthBoardPayload = {
  boardNo: number;
  memberIds: string[];
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const matchId = String(formData.get("matchId") ?? "");
    const teamChoice = String(formData.get("teamChoice") ?? "");
    const payloadJson = String(formData.get("payloadJson") ?? "{}");

    if (!tournamentId || !divisionId || !matchId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (teamChoice !== "team1" && teamChoice !== "team2") {
      return new Response("チーム選択が不正です。", { status: 400 });
    }

    let payload: FifthBoardPayload;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return new Response("5番入力JSONが不正です。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

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

    if (division.event_type !== "team" || division.team_match_format !== "T_LEAGUE") {
      return new Response("このAPIはTリーグ方式専用です。", { status: 400 });
    }

    validateFifthBoardSelection({
      format: "T_LEAGUE",
      boardNo: payload.boardNo,
      memberIds: payload.memberIds ?? [],
    });

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

    const { data: games, error: gamesError } = await supabase
      .from("team_match_games")
      .select("board_no, winner_side")
      .eq("team_match_id", matchId)
      .lte("board_no", 4);

    if (gamesError) {
      return new Response(`団体戦内訳取得に失敗しました: ${gamesError.message}`, {
        status: 500,
      });
    }

    const { team1Wins, team2Wins } = countTeamWinsAfterBoard4(games ?? []);
    if (!(team1Wins === 2 && team2Wins === 2)) {
      return new Response("4番終了時点で2-2ではないため、5番は入力できません。", {
        status: 400,
      });
    }

    const { data: teamMembers, error: membersError } = await supabase
      .from("team_members")
      .select("id, entry_id")
      .eq("entry_id", entryId);

    if (membersError) {
      return new Response(`チームメンバー取得に失敗しました: ${membersError.message}`, {
        status: 500,
      });
    }

    const validMemberIds = new Set((teamMembers ?? []).map((m) => m.id));
    for (const memberId of payload.memberIds ?? []) {
      if (!validMemberIds.has(memberId)) {
        return new Response("自チームに属さないメンバーが選択されています。", {
          status: 400,
        });
      }
    }

    const { data: order, error: orderError } = await supabase
      .from("team_match_orders")
      .select("id, is_locked")
      .eq("team_match_id", matchId)
      .eq("entry_id", entryId)
      .maybeSingle();

    if (orderError || !order?.id) {
      return new Response("初回オーダーが未提出です。", { status: 400 });
    }

    const boards = buildTeamMatchBoards("T_LEAGUE");
    const board5 = boards.find((b) => b.boardNo === 5);
    if (!board5) {
      return new Response("5番設定が見つかりません。", { status: 400 });
    }

    const { data: existingLine } = await supabase
      .from("team_match_order_lines")
      .select("id, member1_id, member2_id")
      .eq("team_match_order_id", order.id)
      .eq("board_no", 5)
      .maybeSingle();

    if (existingLine?.member1_id || existingLine?.member2_id) {
      return new Response("5番はすでに提出済みです。", { status: 400 });
    }

    const row = {
      team_match_order_id: order.id,
      board_no: 5,
      match_type: board5.type,
      member1_id: payload.memberIds?.[0] ?? null,
      member2_id: payload.memberIds?.[1] ?? null,
      member3_id: null,
      member4_id: null,
    };

    if (existingLine?.id) {
      const { error: updateError } = await supabase
        .from("team_match_order_lines")
        .update(row)
        .eq("id", existingLine.id);

      if (updateError) {
        return new Response(`5番更新に失敗しました: ${updateError.message}`, {
          status: 500,
        });
      }
    } else {
      const { error: insertError } = await supabase
        .from("team_match_order_lines")
        .insert(row);

      if (insertError) {
        return new Response(`5番登録に失敗しました: ${insertError.message}`, {
          status: 500,
        });
      }
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${matchId}/team-order?team=${teamChoice}&fifth_submitted=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "5番オーダー提出に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
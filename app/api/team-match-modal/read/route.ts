import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamMatchBoards } from "@/lib/team/buildTeamMatchBoards";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = String(searchParams.get("matchId") ?? "");

    if (!matchId) {
      return new Response("matchId が不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select(`
        id,
        division_id,
        player1_entry_id,
        player2_entry_id,
        status,
        score_text,
        team_match_format
      `)
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return new Response(`試合取得に失敗しました: ${matchError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    const { data: division } = await supabase
      .from("divisions")
      .select("id, format, team_match_format")
      .eq("id", match.division_id)
      .single();

    const entryIds = [match.player1_entry_id, match.player2_entry_id].filter(Boolean) as string[];

    const { data: entries } =
      entryIds.length > 0
        ? await supabase
            .from("entries")
            .select("id, entry_name")
            .in("id", entryIds)
        : { data: [] as any[] };

    const entryMap = new Map((entries ?? []).map((e) => [e.id, e]));

    const { data: orders } = await supabase
      .from("team_match_orders")
      .select("id, entry_id, is_locked")
      .eq("team_match_id", matchId);

    const team1Order = (orders ?? []).find((o) => o.entry_id === match.player1_entry_id);
    const team2Order = (orders ?? []).find((o) => o.entry_id === match.player2_entry_id);

    const bothSubmitted = !!team1Order?.is_locked && !!team2Order?.is_locked;

    const orderIds = (orders ?? []).map((o) => o.id);

    const { data: orderLinesRaw } =
      orderIds.length > 0
        ? await supabase
            .from("team_match_order_lines")
            .select(`
              id,
              team_match_order_id,
              board_no,
              match_type,
              member1_id,
              member2_id
            `)
            .in("team_match_order_id", orderIds)
        : { data: [] as any[] };

    const memberIds = Array.from(
      new Set(
        (orderLinesRaw ?? [])
          .flatMap((line) => [line.member1_id, line.member2_id])
          .filter(Boolean)
      )
    ) as string[];

    const { data: members } =
      memberIds.length > 0
        ? await supabase
            .from("team_members")
            .select("id, name")
            .in("id", memberIds)
        : { data: [] as any[] };

    const memberNameMap = new Map((members ?? []).map((m) => [m.id, m.name]));

    const orderLines: Array<{
      boardNo: number;
      matchType: "W" | "S" | "T";
      team1Label: string;
      team2Label: string;
    }> = [];

    const boards = buildTeamMatchBoards(
      String(match.team_match_format ?? division?.team_match_format ?? "")
    );

    for (const board of boards) {
      const line1 =
        team1Order && orderLinesRaw
          ? orderLinesRaw.find(
              (line) => line.team_match_order_id === team1Order.id && line.board_no === board.boardNo
            )
          : null;

      const line2 =
        team2Order && orderLinesRaw
          ? orderLinesRaw.find(
              (line) => line.team_match_order_id === team2Order.id && line.board_no === board.boardNo
            )
          : null;

      const team1Names = [
        line1?.member1_id ? memberNameMap.get(line1.member1_id) ?? "-" : "",
        line1?.member2_id ? memberNameMap.get(line1.member2_id) ?? "-" : "",
      ].filter(Boolean);

      const team2Names = [
        line2?.member1_id ? memberNameMap.get(line2.member1_id) ?? "-" : "",
        line2?.member2_id ? memberNameMap.get(line2.member2_id) ?? "-" : "",
      ].filter(Boolean);

      orderLines.push({
        boardNo: board.boardNo,
        matchType: board.type,
        team1Label:
          team1Names.length > 0 ? team1Names.join(board.type === "W" ? " / " : "") : "未入力",
        team2Label:
          team2Names.length > 0 ? team2Names.join(board.type === "W" ? " / " : "") : "未入力",
      });
    }

    const { data: gamesRaw } = await supabase
      .from("team_match_games")
      .select(`
        board_no,
        match_type,
        team1_label,
        team2_label,
        winner_side,
        score_text,
        status
      `)
      .eq("team_match_id", matchId)
      .order("board_no", { ascending: true });

    return NextResponse.json({
      matchId: match.id,
      team1Name: entryMap.get(match.player1_entry_id)?.entry_name ?? "チーム1",
      team2Name: entryMap.get(match.player2_entry_id)?.entry_name ?? "チーム2",
      team1EntryId: match.player1_entry_id,
      team2EntryId: match.player2_entry_id,
      matchStatus: match.status,
      teamScoreText: match.score_text,
      team1OrderSubmitted: !!team1Order?.is_locked,
      team2OrderSubmitted: !!team2Order?.is_locked,
      bothSubmitted,
      format: division?.format ?? null,
      teamMatchFormat: match.team_match_format ?? division?.team_match_format ?? null,
      orderLines,
      games:
        (gamesRaw ?? []).map((g) => ({
          boardNo: g.board_no,
          matchType: g.match_type,
          team1Label: g.team1_label,
          team2Label: g.team2_label,
          winnerSide: g.winner_side,
          scoreText: g.score_text,
          status: g.status,
        })) ?? [],
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "試合モーダル読込に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
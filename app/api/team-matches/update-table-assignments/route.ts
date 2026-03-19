import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  tournamentId: string;
  divisionId: string;
  mode: "league" | "match";
  leagueGroupNo?: number;
  matchId?: string;
  courtNos: number[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    const tournamentId = String(body.tournamentId ?? "");
    const divisionId = String(body.divisionId ?? "");
    const mode = String(body.mode ?? "");
    const matchId = body.matchId ? String(body.matchId) : "";
    const leagueGroupNo =
      body.leagueGroupNo !== undefined && body.leagueGroupNo !== null
        ? Number(body.leagueGroupNo)
        : null;

    const rawCourtNos = Array.isArray(body.courtNos) ? body.courtNos : [];

    if (!tournamentId || !divisionId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (mode !== "league" && mode !== "match") {
      return new Response("mode が不正です。", { status: 400 });
    }

    if (mode === "match" && !matchId) {
      return new Response("matchId が不足しています。", { status: 400 });
    }

    if (
      mode === "league" &&
      (!Number.isInteger(leagueGroupNo) || Number(leagueGroupNo) < 1)
    ) {
      return new Response("leagueGroupNo が不正です。", { status: 400 });
    }

    const courtNos = rawCourtNos
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1);

    const deduped: number[] = [];
    for (const n of courtNos) {
      if (!deduped.includes(n)) deduped.push(n);
    }

    const finalCourts = deduped.slice(0, 4);

    const supabase = await createSupabaseServerClient();

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, table_count")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        `大会取得に失敗しました: ${tournamentError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    if (finalCourts.some((n) => n > Number(tournament.table_count ?? 0))) {
      return new Response(
        "使用コート数の範囲外のコート番号が含まれています。",
        { status: 400 }
      );
    }

    if (mode === "league") {
      const { error: deleteError } = await supabase
        .from("division_league_court_assignments")
        .delete()
        .eq("division_id", divisionId)
        .eq("league_group_no", Number(leagueGroupNo));

      if (deleteError) {
        return new Response(
          `リーグコート既存データ削除に失敗しました: ${deleteError.message}`,
          { status: 500 }
        );
      }

      if (finalCourts.length > 0) {
        const rows = finalCourts.map((courtNo, index) => ({
          division_id: divisionId,
          league_group_no: Number(leagueGroupNo),
          slot_no: index + 1,
          court_no: courtNo,
        }));

        const { error: insertError } = await supabase
          .from("division_league_court_assignments")
          .insert(rows);

        if (insertError) {
          return new Response(
            `リーグコート保存に失敗しました: ${insertError.message}`,
            {
              status: 500,
            }
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, division_id")
      .eq("id", matchId)
      .eq("division_id", divisionId)
      .single();

    if (matchError || !match) {
      return new Response(
        `試合取得に失敗しました: ${matchError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    const { error: deleteAssignmentError } = await supabase
      .from("match_table_assignments")
      .delete()
      .eq("match_id", matchId);

    if (deleteAssignmentError) {
      return new Response(
        `試合コート既存データ削除に失敗しました: ${deleteAssignmentError.message}`,
        { status: 500 }
      );
    }

    if (finalCourts.length > 0) {
      const rows = finalCourts.map((courtNo, index) => ({
        match_id: matchId,
        slot_no: index + 1,
        table_no: courtNo,
      }));

      const { error: insertError } = await supabase
        .from("match_table_assignments")
        .insert(rows);

      if (insertError) {
        return new Response(
          `試合コート保存に失敗しました: ${insertError.message}`,
          {
            status: 500,
          }
        );
      }
    }

    const { error: updateMatchError } = await supabase
      .from("matches")
      .update({
        table_no: finalCourts[0] ?? null,
      })
      .eq("id", matchId);

    if (updateMatchError) {
      return new Response(
        `matches 更新に失敗しました: ${updateMatchError.message}`,
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "コート更新に失敗しました。",
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendSlackNotification } from "@/lib/slack";
import { buildLeagueFinishedMessage } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";
    const groupId = formData.get("groupId")?.toString() ?? "";

    if (!tournamentId || !divisionId || !groupId) {
      return new NextResponse("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, name, format")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new NextResponse(
        `種目情報の取得に失敗しました: ${divisionError?.message ?? "unknown"}`,
        { status: 500 }
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("league_groups")
      .select("id, name, results_confirmed")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return new NextResponse(
        `リーグ情報の取得に失敗しました: ${groupError?.message ?? "unknown"}`,
        { status: 500 }
      );
    }

    const { data: matches, error: matchesError } = await supabase
      .from("league_matches")
      .select("id, status")
      .eq("group_id", groupId);

    if (matchesError) {
      return new NextResponse(
        `リーグ試合の取得に失敗しました: ${matchesError.message}`,
        { status: 500 }
      );
    }

    const leagueMatches = matches ?? [];

    if (leagueMatches.length === 0) {
      return new NextResponse("このリーグには試合がありません。", { status: 400 });
    }

    const hasUnfinished = leagueMatches.some((m) => m.status !== "completed");

    if (hasUnfinished) {
      return new NextResponse("未終了の試合があるため、リーグ結果を報告できません。", {
        status: 400,
      });
    }

    if (!group.results_confirmed) {
      const { error: updateGroupError } = await supabase
        .from("league_groups")
        .update({
          results_confirmed: true,
        })
        .eq("id", groupId);

      if (updateGroupError) {
        return new NextResponse(
          `リーグ報告状態の更新に失敗しました: ${updateGroupError.message}`,
          { status: 500 }
        );
      }
    }

    const isLeagueKnockout = division.format === "league_then_knockout";

    await sendSlackNotification(
      buildLeagueFinishedMessage({
        divisionName: division.name ?? "不明な種目",
        groupName: group.name ?? "不明なリーグ",
        isLeagueKnockout,
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "リーグ結果報告に失敗しました。";
    return new NextResponse(message, { status: 500 });
  }
}
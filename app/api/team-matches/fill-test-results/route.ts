import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recomputeDownstreamFromMatch } from "@/lib/team/recomputeKnockout";

function buildTestScoreText(format: string | null | undefined, salt: number) {
  const key = String(format ?? "");

  if (key === "WSS" || key === "WWW") {
    return salt % 2 === 0 ? { left: 2, right: 0 } : { left: 2, right: 1 };
  }

  if (key === "WSSSS" || key === "WSSSW") {
    const mod = salt % 3;
    if (mod === 0) return { left: 3, right: 0 };
    if (mod === 1) return { left: 3, right: 1 };
    return { left: 3, right: 2 };
  }

  if (key === "T_LEAGUE") {
    return salt % 2 === 0 ? { left: 3, right: 1 } : { left: 3, right: 2 };
  }

  return salt % 2 === 0 ? { left: 2, right: 0 } : { left: 2, right: 1 };
}

function pickWinnerSide(params: {
  matchId: string;
  roundNo: number | null;
  matchNo: number | null;
  leagueGroupNo: number | null;
}) {
  const seed =
    params.matchId
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    Number(params.roundNo ?? 0) * 7 +
    Number(params.matchNo ?? 0) * 13 +
    Number(params.leagueGroupNo ?? 0) * 17;

  return seed % 2 === 0 ? "team1" : "team2";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const scope = String(formData.get("scope") ?? "league_only");

    if (!tournamentId || !divisionId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (scope !== "league_only" && scope !== "all") {
      return new Response("scope が不正です。", { status: 400 });
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

    if (division.event_type !== "team") {
      return new Response("このAPIは団体戦専用です。", { status: 400 });
    }

    let query = supabase
      .from("matches")
      .select(`
        id,
        bracket_id,
        round_no,
        match_no,
        league_group_no,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        status,
        score_text
      `)
      .eq("division_id", divisionId)
      .neq("status", "completed")
      .neq("status", "skipped")
      .order("bracket_id", { ascending: true })
      .order("league_group_no", { ascending: true, nullsFirst: false })
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    if (scope === "league_only") {
      query = query.is("bracket_id", null);
    }

    const { data: matches, error: matchesError } = await query;

    if (matchesError) {
      return new Response(`試合取得に失敗しました: ${matchesError.message}`, {
        status: 500,
      });
    }

    for (const match of matches ?? []) {
      const p1 = match.player1_entry_id;
      const p2 = match.player2_entry_id;

      if (!p1 && !p2) continue;

      if (p1 && !p2) {
        const { error } = await supabase
          .from("matches")
          .update({
            winner_entry_id: p1,
            status: "completed",
            score_text: "BYE",
          })
          .eq("id", match.id);

        if (error) {
          return new Response(`BYE更新に失敗しました: ${error.message}`, { status: 500 });
        }

        if (match.bracket_id) {
          await recomputeDownstreamFromMatch(supabase, match.id);
        }
        continue;
      }

      if (!p1 && p2) {
        const { error } = await supabase
          .from("matches")
          .update({
            winner_entry_id: p2,
            status: "completed",
            score_text: "BYE",
          })
          .eq("id", match.id);

        if (error) {
          return new Response(`BYE更新に失敗しました: ${error.message}`, { status: 500 });
        }

        if (match.bracket_id) {
          await recomputeDownstreamFromMatch(supabase, match.id);
        }
        continue;
      }

      const winnerSide = pickWinnerSide({
        matchId: match.id,
        roundNo: match.round_no,
        matchNo: match.match_no,
        leagueGroupNo: match.league_group_no,
      });

      const salt =
        Number(match.round_no ?? 0) +
        Number(match.match_no ?? 0) +
        Number(match.league_group_no ?? 0);

      const score = buildTestScoreText(division.team_match_format, salt);

      const winnerEntryId = winnerSide === "team1" ? p1 : p2;
      const scoreText =
        winnerSide === "team1"
          ? `${score.left}-${score.right}`
          : `${score.right}-${score.left}`;

      const { error } = await supabase
        .from("matches")
        .update({
          winner_entry_id: winnerEntryId,
          status: "completed",
          score_text: scoreText,
        })
        .eq("id", match.id);

      if (error) {
        return new Response(`試合更新に失敗しました: ${error.message}`, { status: 500 });
      }

      if (match.bracket_id) {
        await recomputeDownstreamFromMatch(supabase, match.id);
      }
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "テスト用一括入力に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
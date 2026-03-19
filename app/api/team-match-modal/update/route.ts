import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamMatchBoards, needsFifthBoardInTLeague } from "@/lib/team/buildTeamMatchBoards";
import { recomputeDownstreamFromMatch } from "@/lib/team/recomputeKnockout";

function parseIntOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isInteger(num)) return null;
  return num;
}

function getRequiredWins(format: string) {
  const boards = buildTeamMatchBoards(format);
  return Math.floor(boards.length / 2) + 1;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const tournamentId = String(body.tournamentId ?? "");
    const divisionId = String(body.divisionId ?? "");
    const matchId = String(body.matchId ?? "");
    const boardNo = Number(body.boardNo ?? 0);
    const matchType = String(body.matchType ?? "") as "W" | "S" | "T";
    const team1Label = String(body.team1Label ?? "");
    const team2Label = String(body.team2Label ?? "");
    const winnerSide = String(body.winnerSide ?? "");
    const leftGames = parseIntOrNull(body.leftGames);
    const rightGames = parseIntOrNull(body.rightGames);

    if (!tournamentId || !divisionId || !matchId || !boardNo) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    if (winnerSide !== "team1" && winnerSide !== "team2") {
      return new Response("勝者の指定が不正です。", { status: 400 });
    }

    if (leftGames === null || rightGames === null) {
      return new Response("ゲーム数を入力してください。", { status: 400 });
    }

    if (leftGames === rightGames) {
      return new Response("ゲーム数が同点です。", { status: 400 });
    }

    const expectedWinner = leftGames > rightGames ? "team1" : "team2";
    if (winnerSide !== expectedWinner) {
      return new Response("勝者選択とゲーム数が一致していません。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, event_type, team_match_format")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(`種目取得に失敗しました: ${divisionError?.message ?? "not found"}`, {
        status: 404,
      });
    }

    if (division.event_type !== "team") {
      return new Response("このAPIは団体戦専用です。", { status: 400 });
    }

    const format = String(division.team_match_format ?? "");

    if (format === "T_LEAGUE" && boardNo === 5) {
      const { data: gamesBefore5 } = await supabase
        .from("team_match_games")
        .select("board_no, winner_side")
        .eq("team_match_id", matchId)
        .lte("board_no", 4);

      let team1WinsAfter4 = 0;
      let team2WinsAfter4 = 0;

      for (const game of gamesBefore5 ?? []) {
        if (game.winner_side === "team1") team1WinsAfter4 += 1;
        if (game.winner_side === "team2") team2WinsAfter4 += 1;
      }

      if (
        !needsFifthBoardInTLeague({
          team1WinsAfterBoard4: team1WinsAfter4,
          team2WinsAfterBoard4: team2WinsAfter4,
        })
      ) {
        return new Response("4番終了時点で2-2ではないため、5番は入力できません。", {
          status: 400,
        });
      }
    }

    const scoreText = `${leftGames}-${rightGames}`;

    const { data: existingGame } = await supabase
      .from("team_match_games")
      .select("id")
      .eq("team_match_id", matchId)
      .eq("board_no", boardNo)
      .maybeSingle();

    if (existingGame?.id) {
      const { error: updateError } = await supabase
        .from("team_match_games")
        .update({
          match_type: matchType,
          team1_label: team1Label || null,
          team2_label: team2Label || null,
          winner_side: winnerSide,
          score_text: scoreText,
          game_scores: null,
          status: "completed",
        })
        .eq("id", existingGame.id);

      if (updateError) {
        return new Response(`団体戦内訳更新に失敗しました: ${updateError.message}`, {
          status: 500,
        });
      }
    } else {
      const { error: insertError } = await supabase
        .from("team_match_games")
        .insert({
          team_match_id: matchId,
          board_no: boardNo,
          match_type: matchType,
          team1_label: team1Label || null,
          team2_label: team2Label || null,
          winner_side: winnerSide,
          score_text: scoreText,
          game_scores: null,
          status: "completed",
        });

      if (insertError) {
        return new Response(`団体戦内訳追加に失敗しました: ${insertError.message}`, {
          status: 500,
        });
      }
    }

    const { data: allGames } = await supabase
      .from("team_match_games")
      .select("board_no, winner_side")
      .eq("team_match_id", matchId);

    let team1Wins = 0;
    let team2Wins = 0;

    for (const game of allGames ?? []) {
      if (game.winner_side === "team1") team1Wins += 1;
      if (game.winner_side === "team2") team2Wins += 1;
    }

    const requiredWins = getRequiredWins(format);

    let matchStatus = "in_progress";
    let teamScoreText = `${team1Wins}-${team2Wins}`;
    let winnerEntryId: string | null = null;

    const { data: match } = await supabase
      .from("matches")
      .select("id, player1_entry_id, player2_entry_id")
      .eq("id", matchId)
      .single();

    if (team1Wins >= requiredWins) {
      matchStatus = "completed";
      winnerEntryId = match?.player1_entry_id ?? null;
    } else if (team2Wins >= requiredWins) {
      matchStatus = "completed";
      winnerEntryId = match?.player2_entry_id ?? null;
    }

    const { error: matchUpdateError } = await supabase
      .from("matches")
      .update({
        status: matchStatus,
        score_text: teamScoreText,
        winner_entry_id: winnerEntryId,
      })
      .eq("id", matchId);

    if (matchUpdateError) {
      return new Response(`matches更新に失敗しました: ${matchUpdateError.message}`, {
        status: 500,
      });
    }

    if (matchStatus === "completed" && winnerEntryId) {
      await recomputeDownstreamFromMatch(supabase, matchId);
    }

    return new Response("ok", { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体戦モーダル更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
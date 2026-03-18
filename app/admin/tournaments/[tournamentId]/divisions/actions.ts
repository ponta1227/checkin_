"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeDivisionFormat(value: string) {
  if (value === "league") return "league";
  if (value === "tournament") return "knockout";
  if (value === "knockout") return "knockout";
  if (value === "league_then_knockout") return "league_then_knockout";
  return "league";
}

function normalizeEventType(value: string) {
  if (value === "team") return "team";
  return "singles";
}

function normalizeTeamMatchFormat(value: string | null) {
  if (!value) return null;
  if (["WSSSS", "WSS", "WWW", "WSSSW", "T_LEAGUE"].includes(value)) {
    return value;
  }
  return null;
}

export async function createDivisionAction(formData: FormData) {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const format = normalizeDivisionFormat(String(formData.get("format") ?? "league"));
  const eventType = normalizeEventType(String(formData.get("eventType") ?? "singles"));
  const teamMatchFormat = normalizeTeamMatchFormat(
    String(formData.get("teamMatchFormat") ?? "") || null
  );
  const teamMemberRequired = String(formData.get("teamMemberRequired") ?? "") === "on";

  const teamMemberCountMinRaw = String(formData.get("teamMemberCountMin") ?? "").trim();
  const teamMemberCountMaxRaw = String(formData.get("teamMemberCountMax") ?? "").trim();

  if (!tournamentId) {
    throw new Error("大会IDが不足しています。");
  }

  if (!name) {
    throw new Error("種目名は必須です。");
  }

  const teamMemberCountMin =
    teamMemberCountMinRaw === "" ? null : Number(teamMemberCountMinRaw);
  const teamMemberCountMax =
    teamMemberCountMaxRaw === "" ? null : Number(teamMemberCountMaxRaw);

  if (
    teamMemberCountMin !== null &&
    (!Number.isInteger(teamMemberCountMin) || teamMemberCountMin < 0)
  ) {
    throw new Error("チームメンバー最低人数が不正です。");
  }

  if (
    teamMemberCountMax !== null &&
    (!Number.isInteger(teamMemberCountMax) || teamMemberCountMax < 0)
  ) {
    throw new Error("チームメンバー最大人数が不正です。");
  }

  if (
    teamMemberCountMin !== null &&
    teamMemberCountMax !== null &&
    teamMemberCountMin > teamMemberCountMax
  ) {
    throw new Error("チームメンバー最低人数は最大人数以下にしてください。");
  }

  if (eventType === "team" && !teamMatchFormat) {
    throw new Error("団体戦形式を選択してください。");
  }

  const supabase = createSupabaseServerClient();

  const insertPayload = {
    tournament_id: tournamentId,
    name,
    format,
    event_type: eventType,
    team_match_format: eventType === "team" ? teamMatchFormat : null,
    team_member_required: eventType === "team" ? teamMemberRequired : false,
    team_member_count_min: eventType === "team" ? teamMemberCountMin : null,
    team_member_count_max: eventType === "team" ? teamMemberCountMax : null,
  };

  const { data, error } = await supabase
    .from("divisions")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`種目作成に失敗しました: ${error?.message ?? "unknown"}`);
  }

  redirect(`/admin/tournaments/${tournamentId}/divisions/${data.id}/entries`);
}
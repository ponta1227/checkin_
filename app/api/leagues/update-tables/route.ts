import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseTableValue(raw: string) {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = formData.get("tournamentId")?.toString() ?? "";
    const divisionId = formData.get("divisionId")?.toString() ?? "";

    if (!tournamentId || !divisionId) {
      return new Response("必要なIDが不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: groups, error: groupsError } = await supabase
      .from("league_groups")
      .select("id, group_no")
      .eq("division_id", divisionId)
      .order("group_no", { ascending: true });

    if (groupsError) {
      return new Response(`リーグ取得に失敗しました: ${groupsError.message}`, {
        status: 500,
      });
    }

    for (const group of groups ?? []) {
      const raw = formData.get(`table_group_${group.id}`)?.toString() ?? "";
      const tableNumbers = parseTableValue(raw);

      const { error } = await supabase
        .from("league_groups")
        .update({
          table_numbers: tableNumbers,
        })
        .eq("id", group.id);

      if (error) {
        return new Response(`コート番号更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league?updated=1`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "コート番号更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}

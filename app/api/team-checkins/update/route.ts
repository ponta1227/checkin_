import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClientLike = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

async function ensureCheckinRow(params: {
  supabase: SupabaseClientLike;
  entryId: string;
}) {
  const { supabase, entryId } = params;

  const { data: existing } = await supabase
    .from("checkins")
    .select("id, status, member_confirmed")
    .eq("entry_id", entryId)
    .maybeSingle();

  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("checkins")
    .insert({
      entry_id: entryId,
      status: "pending",
      member_confirmed: false,
    })
    .select("id, status, member_confirmed")
    .single();

  if (error || !inserted) {
    throw new Error(`checkins追加失敗: ${error?.message ?? "unknown"}`);
  }

  return inserted;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const tournamentId = String(formData.get("tournamentId") ?? "");
    const divisionId = String(formData.get("divisionId") ?? "");
    const entryId = String(formData.get("entryId") ?? "");
    const actionType = String(formData.get("actionType") ?? "");

    if (!tournamentId || !divisionId || !entryId) {
      return new Response("必要な値が不足しています。", { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: division, error: divisionError } = await supabase
      .from("divisions")
      .select("id, event_type, team_member_required, team_member_count_min")
      .eq("id", divisionId)
      .single();

    if (divisionError || !division) {
      return new Response(
        `種目取得に失敗しました: ${divisionError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    if (division.event_type !== "team") {
      return new Response("このAPIは団体戦受付用です。", { status: 400 });
    }

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .select("id, division_id")
      .eq("id", entryId)
      .eq("division_id", divisionId)
      .single();

    if (entryError || !entry) {
      return new Response(
        `エントリー取得に失敗しました: ${entryError?.message ?? "not found"}`,
        { status: 404 }
      );
    }

    const checkin = await ensureCheckinRow({ supabase, entryId });

    if (actionType === "checkin") {
      if (division.team_member_required) {
        const { count } = await supabase
          .from("team_members")
          .select("*", { count: "exact", head: true })
          .eq("entry_id", entryId);

        const memberCount = count ?? 0;
        const minCount = division.team_member_count_min ?? 0;

        if (memberCount < minCount) {
          return new Response(
            `この大会ではメンバー登録が必須です。最低 ${minCount} 名必要ですが、現在 ${memberCount} 名です。`,
            { status: 400 }
          );
        }
      }

      const { error } = await supabase
        .from("checkins")
        .update({
          status: "checked_in",
        })
        .eq("id", checkin.id);

      if (error) {
        return new Response(`受付更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    } else if (actionType === "uncheck") {
      const { error } = await supabase
        .from("checkins")
        .update({
          status: "pending",
        })
        .eq("id", checkin.id);

      if (error) {
        return new Response(`受付更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    } else if (actionType === "withdraw") {
      const { error: checkinError } = await supabase
        .from("checkins")
        .update({
          status: "withdrawn",
        })
        .eq("id", checkin.id);

      if (checkinError) {
        return new Response(`棄権更新に失敗しました: ${checkinError.message}`, {
          status: 500,
        });
      }

      const { error: entryUpdateError } = await supabase
        .from("entries")
        .update({
          status: "withdrawn",
        })
        .eq("id", entryId);

      if (entryUpdateError) {
        return new Response(
          `entries更新に失敗しました: ${entryUpdateError.message}`,
          {
            status: 500,
          }
        );
      }
    } else if (actionType === "confirm_members") {
      const { error } = await supabase
        .from("checkins")
        .update({
          member_confirmed: true,
        })
        .eq("id", checkin.id);

      if (error) {
        return new Response(`メンバー確認更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    } else if (actionType === "unconfirm_members") {
      const { error } = await supabase
        .from("checkins")
        .update({
          member_confirmed: false,
        })
        .eq("id", checkin.id);

      if (error) {
        return new Response(`メンバー確認更新に失敗しました: ${error.message}`, {
          status: 500,
        });
      }
    } else {
      return new Response("不正な操作です。", { status: 400 });
    }

    return NextResponse.redirect(
      new URL(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/checkin/team`,
        request.url
      )
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "団体戦受付更新に失敗しました。";
    return new Response(message, { status: 500 });
  }
}
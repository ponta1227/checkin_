import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RequestBody = {
  divisionId?: string;
  matchId?: string;
  courtNumbers?: number[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const divisionId = String(body.divisionId ?? "");
    const matchId = String(body.matchId ?? "");
    const courtNumbers = Array.isArray(body.courtNumbers)
      ? body.courtNumbers
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (!divisionId || !matchId) {
      return new Response("divisionId または matchId が不足しています。", {
        status: 400,
      });
    }

    const supabase = await createSupabaseServerClient();

    const { error: deleteError } = await supabase
      .from("match_table_assignments")
      .delete()
      .eq("match_id", matchId);

    if (deleteError) {
      return new Response(
        `既存コート削除に失敗しました: ${deleteError.message}`,
        {
          status: 500,
        }
      );
    }

    if (courtNumbers.length > 0) {
      const insertRows = courtNumbers.map((tableNo, index) => ({
        match_id: matchId,
        slot_no: index + 1,
        table_no: tableNo,
      }));

      const { error: insertError } = await supabase
        .from("match_table_assignments")
        .insert(insertRows);

      if (insertError) {
        return new Response(
          `試合コート保存に失敗しました: ${insertError.message}`,
          {
            status: 500,
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "試合コート保存に失敗しました。",
      { status: 500 }
    );
  }
}
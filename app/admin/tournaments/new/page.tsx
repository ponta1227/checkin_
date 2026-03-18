import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function createTournamentAction(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();

  if (!name) {
    throw new Error("大会名は必須です。");
  }

  const supabase = createSupabaseServerClient();

  const insertPayload: Record<string, string | null> = {
    name,
  };

  if (eventDate) {
    insertPayload.event_date = eventDate;
  }

  if (venue) {
    insertPayload.venue = venue;
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`大会作成に失敗しました: ${error?.message ?? "unknown"}`);
  }

  redirect(`/admin/tournaments/${data.id}`);
}

export default function NewTournamentPage() {
  return (
    <main style={{ padding: "24px", maxWidth: "800px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/tournaments">← 大会一覧へ戻る</Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>新規大会作成</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "24px" }}>
        大会名を入力して新しい大会を作成します。
      </p>

      <form action={createTournamentAction} style={{ display: "grid", gap: "20px" }}>
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>
            大会情報
          </h2>

          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="name">大会名</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="例: 2026年度 春季卓球大会"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="eventDate">開催日</label>
              <input
                id="eventDate"
                name="eventDate"
                type="date"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="venue">会場</label>
              <input
                id="venue"
                name="venue"
                type="text"
                placeholder="例: 朝霞市総合体育館"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>
          </div>
        </section>

        <div>
          <button
            type="submit"
            style={{
              padding: "12px 18px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              background: "white",
              cursor: "pointer",
            }}
          >
            大会を作成
          </button>
        </div>
      </form>
    </main>
  );
}
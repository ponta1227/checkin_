import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ tournamentId: string }>;
};

export default async function TournamentDetailPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id, name, event_date, venue, status, created_at")
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href="/admin/tournaments">← 大会一覧へ戻る</Link>
        </div>

        <h1>大会詳細</h1>
        <p>大会が見つかりませんでした。</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/tournaments">← 大会一覧へ戻る</Link>
      </div>

      <h1 style={{ marginBottom: "24px" }}>大会詳細</h1>

      <div
        style={{
          display: "grid",
          gap: "16px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>大会名</div>
          <div>{tournament.name}</div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>開催日</div>
          <div>{tournament.event_date ?? "-"}</div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>会場</div>
          <div>{tournament.venue ?? "-"}</div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>状態</div>
          <div>{tournament.status}</div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>作成日時</div>
          <div>{tournament.created_at}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/${tournament.id}/divisions`}
          style={{
            display: "inline-block",
            padding: "10px 16px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            textDecoration: "none",
            color: "black",
          }}
        >
          種目一覧へ
        </Link>
      </div>
    </main>
  );
}
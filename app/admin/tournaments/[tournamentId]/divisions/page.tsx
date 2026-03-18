import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ tournamentId: string }>;
};

type Division = {
  id: string;
  name: string;
  format: string;
  max_players: number | null;
};

export default async function DivisionsPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return (
      <main style={{ padding: "24px" }}>
        <Link href="/admin/tournaments">← 大会一覧へ戻る</Link>
        <h1 style={{ marginTop: "24px" }}>種目一覧</h1>
        <p>大会が見つかりませんでした。</p>
      </main>
    );
  }

  const { data: divisions, error } = await supabase
    .from("divisions")
    .select("id, name, format, max_players")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}`}>← 大会詳細へ戻る</Link>
        <h1 style={{ marginTop: "24px" }}>種目一覧</h1>
        <p>データの取得に失敗しました: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}`}>← 大会詳細へ戻る</Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>種目一覧</h1>
          <p style={{ marginTop: "8px" }}>{tournament.name}</p>
        </div>

        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/new`}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            textDecoration: "none",
            color: "black",
          }}
        >
          新規種目作成
        </Link>
      </div>

      {!divisions || divisions.length === 0 ? (
        <p>まだ種目がありません。</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                種目名
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                形式
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                定員
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>
                参加者
              </th>
            </tr>
          </thead>
          <tbody>
            {divisions.map((division: Division) => (
              <tr key={division.id}>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {division.name}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {division.format}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  {division.max_players ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>
                  <Link
                    href={`/admin/tournaments/${tournamentId}/divisions/${division.id}/entries`}
                  >
                    参加者管理
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
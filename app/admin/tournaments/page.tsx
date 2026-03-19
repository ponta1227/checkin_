import Link from "next/link";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Tournament = {
  id: string;
  name: string;
  event_date: string | null;
  venue: string | null;
  status: string;
};

export default async function AdminTournamentsPage() {
  await connection();

  const supabase = createSupabaseServerClient();

  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select("id, name, event_date, venue, status")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>大会一覧</h1>
        <p>データの取得に失敗しました: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ margin: 0 }}>大会一覧</h1>

        <Link
          href="/admin/tournaments/new"
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            textDecoration: "none",
            color: "black",
          }}
        >
          新規大会作成
        </Link>
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <p>まだ大会がありません。</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ccc",
                  padding: "8px",
                }}
              >
                大会名
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ccc",
                  padding: "8px",
                }}
              >
                開催日
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ccc",
                  padding: "8px",
                }}
              >
                会場
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ccc",
                  padding: "8px",
                }}
              >
                状態
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ccc",
                  padding: "8px",
                }}
              >
                詳細
              </th>
            </tr>
          </thead>

          <tbody>
            {tournaments.map((tournament: Tournament) => (
              <tr key={tournament.id}>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px",
                  }}
                >
                  {tournament.name}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px",
                  }}
                >
                  {tournament.event_date ?? "-"}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px",
                  }}
                >
                  {tournament.venue ?? "-"}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px",
                  }}
                >
                  {tournament.status}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: "8px",
                  }}
                >
                  <Link href={`/admin/tournaments/${tournament.id}`}>詳細</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
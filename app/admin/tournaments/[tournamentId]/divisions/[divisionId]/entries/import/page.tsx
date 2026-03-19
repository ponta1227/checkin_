import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
  }>;
};

export default async function DivisionEntriesImportPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type")
    .eq("id", divisionId)
    .single();

  return (
    <main style={{ padding: "24px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}
          style={linkButtonStyle()}
        >
          エントリー一覧へ戻る
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
          style={linkButtonStyle()}
        >
          種目管理へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>CSV取込</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division?.name ?? "-"}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          padding: "16px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          {division?.event_type === "team" ? "団体戦CSV取込" : "CSV取込"}
        </h2>

        <p style={{ color: "#666", lineHeight: 1.7 }}>
          CSVファイルを選択してアップロードしてください。
          <br />
          団体戦は既存の <code>/api/team-entries/import-csv</code> を使って取り込みます。
        </p>

        <form
          action="/api/team-entries/import-csv"
          method="post"
          encType="multipart/form-data"
          style={{ display: "grid", gap: "14px", marginTop: "16px" }}
        >
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="divisionId" value={divisionId} />

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 700 }}>
              CSVファイル
            </label>
            <input
              type="file"
              name="csvFile"
              accept=".csv,text/csv"
              style={{ display: "block" }}
              required
            />
          </div>

          <div>
            <button type="submit" style={submitButtonStyle()}>
              CSVを取り込む
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function linkButtonStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    color: "inherit",
    textDecoration: "none",
  };
}

function submitButtonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    cursor: "pointer",
  };
}
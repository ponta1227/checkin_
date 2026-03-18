import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

function CsvSampleBlock({ eventType }: { eventType: "singles" | "team" }) {
  if (eventType === "team") {
    return (
      <pre
        style={{
          margin: 0,
          padding: "12px",
          background: "#fafafa",
          border: "1px solid #eee",
          borderRadius: "8px",
          overflowX: "auto",
          fontSize: "13px",
          lineHeight: 1.5,
        }}
      >
{`team_name,affiliation,seed,application_rank,member1,member2,member3,member4,member5,member6
朝霞A,朝霞高校,1,1,山田,佐藤,鈴木,田中,高橋,伊藤
朝霞B,朝霞高校,2,2,中村,小林,加藤,吉田,山本,渡辺`}
      </pre>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: "12px",
        background: "#fafafa",
        border: "1px solid #eee",
        borderRadius: "8px",
        overflowX: "auto",
        fontSize: "13px",
        lineHeight: 1.5,
      }}
    >
{`name,affiliation,seed,application_rank
山田太郎,朝霞高校,1,1
佐藤次郎,朝霞高校,2,2`}
    </pre>
  );
}

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
    .select(`
      id,
      name,
      event_type,
      team_match_format,
      team_member_required,
      team_member_count_min,
      team_member_count_max
    `)
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}`}>
            ← 大会管理へ戻る
          </Link>
        </div>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  const eventType: "singles" | "team" =
    division.event_type === "team" ? "team" : "singles";

  const submitPath =
    eventType === "team"
      ? "/api/team-entries/import-csv"
      : "/api/divisions/import-csv";

  return (
    <main style={{ padding: "24px", maxWidth: "980px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}>
          ← エントリー一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>
        {eventType === "team" ? "団体戦CSV取込" : "個人戦CSV取込"}
      </h1>

      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name}
      </p>

      <div style={{ display: "grid", gap: "20px" }}>
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
            アップロード
          </h2>

          <form
            action={submitPath}
            method="post"
            encType="multipart/form-data"
            style={{ display: "grid", gap: "14px" }}
          >
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="divisionId" value={divisionId} />

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="csvFile">CSVファイル</label>
              <input
                id="csvFile"
                name="csvFile"
                type="file"
                accept=".csv,text/csv"
                required
                style={{
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                }}
              />
            </div>

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
                CSVを取り込む
              </button>
            </div>
          </form>
        </section>

        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
            取込仕様
          </h2>

          {eventType === "team" ? (
            <div style={{ display: "grid", gap: "10px", color: "#444" }}>
              <p style={{ margin: 0 }}>
                団体戦では <strong>team_name（チーム名）</strong> が必須です。
              </p>
              <p style={{ margin: 0 }}>
                主な列名:
                <br />
                <code>team_name</code>, <code>affiliation</code>, <code>seed</code>,{" "}
                <code>application_rank</code>, <code>member1</code>〜
                <code>member8</code>
              </p>
              <p style={{ margin: 0 }}>
                メンバー登録:
                {division.team_member_required ? " 必須" : " 任意"}
                {division.team_member_count_min !== null
                  ? ` / 最低 ${division.team_member_count_min} 名`
                  : ""}
                {division.team_member_count_max !== null
                  ? ` / 最大 ${division.team_member_count_max} 名`
                  : ""}
              </p>
              <p style={{ margin: 0 }}>
                団体戦形式: {division.team_match_format ?? "-"}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px", color: "#444" }}>
              <p style={{ margin: 0 }}>
                個人戦では <strong>name（名前）</strong> が必須です。
              </p>
              <p style={{ margin: 0 }}>
                主な列名:
                <br />
                <code>name</code>, <code>affiliation</code>, <code>seed</code>,{" "}
                <code>application_rank</code>
              </p>
            </div>
          )}
        </section>

        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
            CSVサンプル
          </h2>

          <CsvSampleBlock eventType={eventType} />
        </section>

        {eventType === "team" && (
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "16px",
              background: "white",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
              団体戦CSVの補足
            </h2>

            <div style={{ display: "grid", gap: "8px", color: "#444" }}>
              <p style={{ margin: 0 }}>
                メンバー個別の所属や seed も入れる場合は、次のような列名が使えます。
              </p>

              <pre
                style={{
                  margin: 0,
                  padding: "12px",
                  background: "#fafafa",
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  overflowX: "auto",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
{`team_name,affiliation,seed,application_rank,member1,member1_affiliation,member1_seed,member1_application_rank,member2,member2_affiliation
朝霞A,朝霞高校,1,1,山田,朝霞高校,1,1,佐藤,朝霞高校`}
              </pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CsvImportForm from "@/components/CsvImportForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
  searchParams: Promise<{
    success?: string;
    players_created?: string;
    players_reused?: string;
    entries_created?: string;
    entries_skipped?: string;
    error?: string;
    error_detail?: string;
  }>;
};

function getErrorMessage(error?: string) {
  if (error === "missing_file") {
    return "CSVファイルが選択されていません。";
  }
  if (error === "empty_csv") {
    return "CSVファイルが空です。";
  }
  if (error === "missing_name_header") {
    return "CSVのヘッダーに name または 氏名 が必要です。";
  }
  if (error?.startsWith("invalid_row_")) {
    const line = error.replace("invalid_row_", "");
    return `${line}行目のデータに不備があります。`;
  }
  if (error?.startsWith("invalid_number_")) {
    const line = error.replace("invalid_number_", "");
    return `${line}行目の数値項目が不正です。`;
  }
  if (error === "upload_failed") {
    return "CSV取込に失敗しました。";
  }
  return "";
}

export default async function DivisionImportCsvPage({
  params,
  searchParams,
}: PageProps) {
  const { tournamentId, divisionId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("id", divisionId)
    .single();

  if (!tournament || !division) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>CSV取込</h1>
        <p>大会または種目が見つかりませんでした。</p>
      </main>
    );
  }

  const errorMessage = getErrorMessage(resolvedSearchParams.error);
  const errorDetail = resolvedSearchParams.error_detail ?? "";

  return (
    <main style={{ padding: "24px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目ページへ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>CSVで参加者取込</h1>
      <p style={{ marginBottom: "8px" }}>大会: {tournament.name}</p>
      <p style={{ marginBottom: "24px" }}>種目: {division.name}</p>

      {resolvedSearchParams.success && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            border: "1px solid #b7e1c1",
            background: "#f3fff5",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            CSV取込が完了しました。
          </div>
          <div>新規 players 作成: {resolvedSearchParams.players_created ?? "0"}</div>
          <div>既存 players 再利用: {resolvedSearchParams.players_reused ?? "0"}</div>
          <div>新規 entries 作成: {resolvedSearchParams.entries_created ?? "0"}</div>
          <div>既存 entries のためスキップ: {resolvedSearchParams.entries_skipped ?? "0"}</div>
        </div>
      )}

      {(errorMessage || errorDetail) && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            border: "1px solid #f0b6b6",
            background: "#fff5f5",
            borderRadius: "8px",
            color: "#a33",
          }}
        >
          {errorMessage && <div style={{ fontWeight: "bold", marginBottom: "8px" }}>{errorMessage}</div>}
          {errorDetail && (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: "12px",
                background: "#fff",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #f0d0d0",
              }}
            >
              {errorDetail}
            </pre>
          )}
        </div>
      )}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "16px" }}>アップロード</h2>

        <CsvImportForm
          tournamentId={tournamentId}
          divisionId={divisionId}
        />
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px" }}>対応ヘッダー</h2>
        <p style={{ marginBottom: "12px" }}>
          最低限必要なのは <strong>name</strong> または <strong>氏名</strong> です。
        </p>
        <p style={{ marginBottom: "12px" }}>次の列に対応しています。</p>

        <pre
          style={{
            background: "#f7f7f7",
            padding: "12px",
            borderRadius: "8px",
            overflowX: "auto",
            marginBottom: "12px",
          }}
        >
{`name
kana
affiliation
rating
seed
entry_rating
ranking_for_draw
affiliation_order`}
        </pre>

        <p style={{ marginBottom: "12px" }}>日本語ヘッダーでも一部対応しています。</p>

        <pre
          style={{
            background: "#f7f7f7",
            padding: "12px",
            borderRadius: "8px",
            overflowX: "auto",
          }}
        >
{`氏名
ふりがな
所属
レーティング
シード
組合せレーティング
組み合わせ順位
所属内順位`}
        </pre>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px" }}>CSVサンプル</h2>

        <pre
          style={{
            background: "#f7f7f7",
            padding: "12px",
            borderRadius: "8px",
            overflowX: "auto",
          }}
        >
{`name,kana,affiliation,rating,seed,entry_rating,ranking_for_draw,affiliation_order
木村尚人,きむらなおと,P-CONNECT,1620,1,1620,1,1
山田太郎,やまだたろう,朝霞クラブ,1500,2,1500,2,1
佐藤花子,さとうはなこ,朝霞クラブ,1500,,1480,3,2`}
        </pre>
      </div>
    </main>
  );
}
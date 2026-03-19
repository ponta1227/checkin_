import type { CSSProperties } from "react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDivisionFormat } from "@/lib/divisions/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
  }>;
};

function buttonStyle(): CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    textDecoration: "none",
    color: "inherit",
  };
}

export default async function DivisionPrintIndexPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format")
    .eq("id", divisionId)
    .single();

  const normalizedFormat = normalizeDivisionFormat(division?.format);
  const format: string = String(normalizedFormat ?? "");

  const showLeaguePrint =
    format === "league" || format === "league_then_knockout";

  const showBracketPrint =
    format === "single_elimination" ||
    format === "knockout" ||
    format === "tournament";

  const showLeagueKnockoutPrint = format === "league_then_knockout";

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目管理へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "12px" }}>印刷用ページ一覧</h1>

      <div style={{ marginBottom: "20px", color: "#555" }}>
        <div>大会: {tournament?.name ?? "-"}</div>
        <div>種目: {division?.name ?? "-"}</div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {showLeaguePrint && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/league`}
            style={buttonStyle()}
          >
            リーグ表を表示
          </Link>
        )}

        {showBracketPrint && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/bracket`}
            style={buttonStyle()}
          >
            トーナメント表を表示
          </Link>
        )}

        {showLeagueKnockoutPrint && (
          <>
            <Link
              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/league-knockout`}
              style={buttonStyle()}
            >
              順位別トーナメント表を表示
            </Link>

            <Link
              href={`/api/divisions/${divisionId}/league-knockout-pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={buttonStyle()}
            >
              順位別トーナメントPDFを開く
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
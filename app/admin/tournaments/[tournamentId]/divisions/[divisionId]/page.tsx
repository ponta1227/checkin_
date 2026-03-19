import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicDivisionLinksCard from "@/components/PublicDivisionLinksCard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
  }>;
};

function formatLabel(format: string | null | undefined) {
  if (format === "league") return "リーグ戦";
  if (format === "knockout") return "トーナメント戦";
  if (format === "league_then_knockout") return "リーグ→トーナメント戦";
  return format ?? "-";
}

function eventTypeLabel(eventType: string | null | undefined) {
  if (eventType === "single") return "シングルス";
  if (eventType === "team") return "団体戦";
  return eventType ?? "-";
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid #ddd",
    borderRadius: "10px",
    background: "white",
    padding: "16px",
  };
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

export default async function DivisionDetailPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

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
      format,
      event_type,
      team_match_format,
      public_access_token
    `)
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions`}>
            ← 種目一覧へ戻る
          </Link>
        </div>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  const isTeam = division.event_type === "team";
  const isLeague = division.format === "league";
  const isKnockout = division.format === "knockout";
  const isLeagueThenKnockout = division.format === "league_then_knockout";

  return (
    <main style={{ padding: "24px", maxWidth: "1100px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions`}>
          ← 種目一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>種目管理</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"}
      </p>

      <section style={{ ...cardStyle(), marginBottom: "20px" }}>
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>種目情報</h2>

        <div style={{ display: "grid", gap: "8px" }}>
          <div>
            <strong>種目名:</strong> {division.name}
          </div>
          <div>
            <strong>種別:</strong> {eventTypeLabel(division.event_type)}
          </div>
          <div>
            <strong>試合形式:</strong> {formatLabel(division.format)}
          </div>
          {isTeam && (
            <div>
              <strong>団体戦形式:</strong> {division.team_match_format ?? "-"}
            </div>
          )}
        </div>
      </section>

      <section style={{ ...cardStyle(), marginBottom: "20px" }}>
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          基本管理
        </h2>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}
            style={linkButtonStyle()}
          >
            エントリー管理
          </Link>

          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/checkin`}
            style={linkButtonStyle()}
          >
            受付管理
          </Link>

          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
            style={linkButtonStyle()}
          >
            試合一覧
          </Link>
        </div>
      </section>

      <section style={{ ...cardStyle(), marginBottom: "20px" }}>
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          進行画面
        </h2>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
            style={linkButtonStyle()}
          >
            試合一覧へ
          </Link>

          {(isLeague || isLeagueThenKnockout) && (
            <Link
              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/league`}
              style={linkButtonStyle()}
            >
              リーグ表UI
            </Link>
          )}

          {(isKnockout || isLeagueThenKnockout) && (
            <Link
              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}
              style={linkButtonStyle()}
            >
              トーナメントUI
            </Link>
          )}
        </div>
      </section>

      <section style={{ ...cardStyle(), marginBottom: "20px" }}>
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          印刷ページ
        </h2>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {(isLeague || isLeagueThenKnockout) && (
            <Link
              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/team-league`}
              style={linkButtonStyle()}
            >
              リーグ表印刷
            </Link>
          )}

          {(isKnockout || isLeagueThenKnockout) && (
            <Link
              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/team-bracket`}
              style={linkButtonStyle()}
            >
              トーナメント表印刷
            </Link>
          )}
        </div>
      </section>

      <PublicDivisionLinksCard
        tournamentId={tournamentId}
        divisionId={divisionId}
        token={division.public_access_token ?? null}
      />
    </main>
  );
}
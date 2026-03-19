import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
  }>;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_affiliation: string | null;
  status: string | null;
  seed: number | null;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  team_members: string[] | null;
  players:
    | Array<{
        id: string;
        name: string | null;
        affiliation: string | null;
        rating: number | null;
      }>
    | null;
  checkins:
    | Array<{
        id?: string;
        status: string | null;
      }>
    | null;
};

function getCheckinStatus(entry: EntryRow) {
  return entry.checkins?.[0]?.status ?? null;
}

function buildDisplayName(entry: EntryRow, isTeam: boolean) {
  if (isTeam) return entry.entry_name ?? "名称未設定";
  return entry.players?.[0]?.name ?? entry.entry_name ?? "名称未設定";
}

function buildDisplayAffiliation(entry: EntryRow, isTeam: boolean) {
  if (isTeam) return entry.entry_affiliation ?? "-";
  return entry.players?.[0]?.affiliation ?? entry.entry_affiliation ?? "-";
}

function buildDisplayRating(entry: EntryRow, isTeam: boolean) {
  if (entry.entry_rating != null) return entry.entry_rating;
  if (!isTeam) return entry.players?.[0]?.rating ?? "-";
  return "-";
}

function buildMembersText(entry: EntryRow) {
  if (!entry.team_members || entry.team_members.length === 0) return "-";
  return entry.team_members.join(" / ");
}

export default async function DivisionEntriesPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  if (tournamentError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>大会情報の取得に失敗しました: {tournamentError.message}</p>
      </main>
    );
  }

  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select("id, name, event_type, format")
    .eq("id", divisionId)
    .single();

  if (divisionError || !division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目情報の取得に失敗しました: {divisionError?.message ?? "not found"}</p>
      </main>
    );
  }

  const { data: entriesData, error: entriesError } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      status,
      seed,
      entry_rating,
      ranking_for_draw,
      team_members,
      players (
        id,
        name,
        affiliation,
        rating
      ),
      checkins (
        id,
        status
      )
    `)
    .eq("division_id", divisionId)
    .order("ranking_for_draw", { ascending: true, nullsFirst: false })
    .order("entry_name", { ascending: true });

  if (entriesError) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>エントリー一覧の取得に失敗しました: {entriesError.message}</p>
      </main>
    );
  }

  const entries = (entriesData ?? []) as unknown as EntryRow[];
  const isTeam = division.event_type === "team";

  return (
    <main style={{ padding: "24px", maxWidth: "1400px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
          style={linkButtonStyle()}
        >
          種目管理へ
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/checkin`}
          style={linkButtonStyle()}
        >
          受付管理へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>エントリー一覧</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name} / 形式: {division.format ?? "-"}
      </p>

      {isTeam && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            background: "white",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
            CSV取込
          </h2>

          <p style={{ marginTop: 0, color: "#666", lineHeight: 1.7 }}>
            団体戦CSVをそのまま取り込めます。
          </p>

          <form
            action="/api/team-entries/import-csv"
            method="post"
            encType="multipart/form-data"
            style={{ display: "grid", gap: "14px" }}
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
                required
                style={{ display: "block" }}
              />
            </div>

            <div>
              <button type="submit" style={submitButtonStyle()}>
                CSVを取り込む
              </button>
            </div>
          </form>
        </section>
      )}

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #eee",
            fontWeight: 700,
          }}
        >
          全 {entries.length} 件
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: "16px", color: "#666" }}>エントリーがありません。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thStyle()}>表示名</th>
                  <th style={thStyle()}>所属</th>
                  {isTeam && <th style={thStyle()}>選手</th>}
                  <th style={thStyle()}>受付状態</th>
                  <th style={thStyle()}>エントリー状態</th>
                  <th style={thStyle()}>seed</th>
                  <th style={thStyle()}>draw順</th>
                  <th style={thStyle()}>rating</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={tdStyle()}>{buildDisplayName(entry, isTeam)}</td>
                    <td style={tdStyle()}>{buildDisplayAffiliation(entry, isTeam)}</td>
                    {isTeam && <td style={tdStyle()}>{buildMembersText(entry)}</td>}
                    <td style={tdStyle()}>{getCheckinStatus(entry) ?? "-"}</td>
                    <td style={tdStyle()}>{entry.status ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.seed ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.ranking_for_draw ?? "-"}</td>
                    <td style={tdStyleCenter()}>{buildDisplayRating(entry, isTeam)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function thStyle(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #eee",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
}

function tdStyle(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #f0f0f0",
    textAlign: "left",
    verticalAlign: "top",
  };
}

function tdStyleCenter(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #f0f0f0",
    textAlign: "center",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  };
}
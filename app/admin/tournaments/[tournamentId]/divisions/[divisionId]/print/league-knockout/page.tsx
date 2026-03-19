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
  players:
    | Array<{
        id: string;
        name: string | null;
        affiliation: string | null;
      }>
    | null;
  checkins:
    | Array<{
        status: string | null;
      }>
    | null;
};

function isCheckedIn(entry: EntryRow) {
  return entry.checkins?.[0]?.status === "checked_in";
}

function getFirstPlayer(entry: EntryRow) {
  return Array.isArray(entry.players) ? (entry.players[0] ?? null) : null;
}

function buildTeamLabel(entry: EntryRow) {
  const player = getFirstPlayer(entry);

  const teamName = entry.entry_name ?? player?.name ?? "-";
  const affiliation = entry.entry_affiliation ?? player?.affiliation ?? "-";

  return {
    teamName,
    affiliation,
  };
}

function sortEntries(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const drawA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const drawB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (drawA !== drawB) return drawA - drawB;

    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const ratingA = a.entry_rating ?? Number.NEGATIVE_INFINITY;
    const ratingB = b.entry_rating ?? Number.NEGATIVE_INFINITY;
    if (ratingA !== ratingB) return ratingB - ratingA;

    const playerA = getFirstPlayer(a);
    const playerB = getFirstPlayer(b);

    const nameA = a.entry_name ?? playerA?.name ?? "";
    const nameB = b.entry_name ?? playerB?.name ?? "";
    return nameA.localeCompare(nameB, "ja");
  });
}

export default async function LeagueKnockoutPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

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

  const { data: rawEntriesData, error: entriesError } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      status,
      seed,
      entry_rating,
      ranking_for_draw,
      players (
        id,
        name,
        affiliation
      ),
      checkins (
        status
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  if (entriesError) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>エントリー取得に失敗しました: {entriesError.message}</p>
      </main>
    );
  }

  const entriesData = (rawEntriesData ?? []) as EntryRow[];

  const entryLabelMap: Record<string, string> = {};
  for (const entry of entriesData) {
    const player = getFirstPlayer(entry);
    const name = entry.entry_name ?? player?.name ?? "-";
    const affiliation = entry.entry_affiliation ?? player?.affiliation ?? "";
    entryLabelMap[entry.id] = affiliation ? `${name}（${affiliation}）` : name;
  }

  const allEntries = entriesData;
  const checkedInEntries = sortEntries(allEntries.filter((entry) => isCheckedIn(entry)));
  const allSortedEntries = sortEntries(allEntries);

  return (
    <main style={{ padding: "24px", maxWidth: "1100px" }}>
      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
          style={linkButtonStyle()}
        >
          種目管理へ
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
          style={linkButtonStyle()}
        >
          試合一覧へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>リーグ→トーナメント設定確認</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name}
      </p>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>受付済みチーム</h2>
        {checkedInEntries.length === 0 ? (
          <p style={{ margin: 0 }}>受付済みチームはありません。</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle()}>チーム名</th>
                <th style={thStyle()}>所属</th>
                <th style={thStyleCenter()}>seed</th>
                <th style={thStyleCenter()}>draw順</th>
                <th style={thStyleCenter()}>rating</th>
              </tr>
            </thead>
            <tbody>
              {checkedInEntries.map((entry) => {
                const { teamName, affiliation } = buildTeamLabel(entry);

                return (
                  <tr key={entry.id}>
                    <td style={tdStyle()}>{teamName}</td>
                    <td style={tdStyle()}>{affiliation}</td>
                    <td style={tdStyleCenter()}>{entry.seed ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.ranking_for_draw ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.entry_rating ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: "20px" }}>
        <h2 style={sectionTitleStyle}>全エントリー</h2>
        {allSortedEntries.length === 0 ? (
          <p style={{ margin: 0 }}>エントリーがありません。</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle()}>チーム名</th>
                <th style={thStyle()}>所属</th>
                <th style={thStyleCenter()}>受付</th>
                <th style={thStyleCenter()}>seed</th>
                <th style={thStyleCenter()}>draw順</th>
                <th style={thStyleCenter()}>rating</th>
              </tr>
            </thead>
            <tbody>
              {allSortedEntries.map((entry) => {
                const { teamName, affiliation } = buildTeamLabel(entry);

                return (
                  <tr key={entry.id}>
                    <td style={tdStyle()}>{teamName}</td>
                    <td style={tdStyle()}>{affiliation}</td>
                    <td style={tdStyleCenter()}>
                      {isCheckedIn(entry) ? "受付済み" : "-"}
                    </td>
                    <td style={tdStyleCenter()}>{entry.seed ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.ranking_for_draw ?? "-"}</td>
                    <td style={tdStyleCenter()}>{entry.entry_rating ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: "10px",
  padding: "16px",
  background: "white",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "12px",
  fontSize: "18px",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

function thStyle(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #eee",
    textAlign: "left",
    background: "#fafafa",
  };
}

function thStyleCenter(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #eee",
    textAlign: "center",
    background: "#fafafa",
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
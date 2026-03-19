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
  seed: number | null;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  players: Array<{
    id: string;
    name: string | null;
    affiliation: string | null;
    rating: number | null;
  }> | null;
  checkins: Array<{
    status: string | null;
  }> | null;
};

function isCheckedIn(entry: EntryRow) {
  return entry.checkins?.[0]?.status === "checked_in";
}

function sortEntries(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const drawA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const drawB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (drawA !== drawB) return drawA - drawB;

    const ratingA =
      a.entry_rating ?? a.players?.[0]?.rating ?? Number.NEGATIVE_INFINITY;
    const ratingB =
      b.entry_rating ?? b.players?.[0]?.rating ?? Number.NEGATIVE_INFINITY;
    if (ratingA !== ratingB) return ratingB - ratingA;

    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    return (a.entry_name ?? "").localeCompare(b.entry_name ?? "", "ja");
  });
}

function buildLabel(entry: EntryRow) {
  const base =
    entry.entry_name && entry.entry_name.trim() !== ""
      ? entry.entry_name
      : "名称未設定";

  const checked = isCheckedIn(entry) ? "（受付済み）" : "";
  return `${base}${checked}`;
}

export default async function BracketEditPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, format")
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  const { data: allEntriesData, error: entriesError } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      seed,
      entry_rating,
      ranking_for_draw,
      players (
        id,
        name,
        affiliation,
        rating
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
        <p>参加者の取得に失敗しました: {entriesError.message}</p>
      </main>
    );
  }

  const allEntries = ((allEntriesData ?? []) as unknown as EntryRow[]);
  const checkedInEntries = sortEntries(
    allEntries.filter((entry) => isCheckedIn(entry))
  );
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
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}
          style={linkButtonStyle()}
        >
          トーナメント表へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>トーナメント編集</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name}
      </p>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>受付済みチーム</h2>
        {checkedInEntries.length === 0 ? (
          <p style={{ margin: 0 }}>受付済みチームはありません。</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {checkedInEntries.map((entry, index) => (
              <div key={entry.id} style={rowStyle}>
                <div style={{ width: "48px", color: "#666" }}>{index + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, wordBreak: "break-word" }}>
                    {buildLabel(entry)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", wordBreak: "break-word" }}>
                    {entry.entry_affiliation ?? ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: "20px" }}>
        <h2 style={sectionTitleStyle}>全エントリー</h2>
        {allSortedEntries.length === 0 ? (
          <p style={{ margin: 0 }}>エントリーがありません。</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {allSortedEntries.map((entry, index) => (
              <div key={entry.id} style={rowStyle}>
                <div style={{ width: "48px", color: "#666" }}>{index + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, wordBreak: "break-word" }}>
                    {buildLabel(entry)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", wordBreak: "break-word" }}>
                    {entry.entry_affiliation ?? ""}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap" }}>
                  draw: {entry.ranking_for_draw ?? "-"} / rating:{" "}
                  {entry.entry_rating ?? entry.players?.[0]?.rating ?? "-"}
                </div>
              </div>
            ))}
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

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  padding: "10px 0",
  borderBottom: "1px solid #f0f0f0",
};
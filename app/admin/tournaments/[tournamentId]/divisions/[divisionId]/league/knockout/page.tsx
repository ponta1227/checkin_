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
  players:
    | Array<{
        id: string;
        name: string | null;
        affiliation: string | null;
      }>
    | null;
};

type MatchRow = {
  id: string;
  round_no: number | null;
  match_no: number | null;
  status: string | null;
  score_text: string | null;
  bracket_id: string | null;
  league_group_no: number | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  player1_source_type: string | null;
  player1_source_group_no: number | null;
  player1_source_rank: number | null;
  player2_source_type: string | null;
  player2_source_group_no: number | null;
  player2_source_rank: number | null;
};

type BracketRow = {
  id: string;
  bracket_type: string | null;
};

function getBracketLabel(bracketType: string | null | undefined) {
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (bracketType === "main") return "本戦";
  if (bracketType && /^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType ?? "-";
}

function getEntryDisplayName(entry: EntryRow | undefined) {
  if (!entry) return "未定";
  return entry.entry_name ?? entry.players?.[0]?.name ?? "未定";
}

function getEntryDisplayAffiliation(entry: EntryRow | undefined) {
  if (!entry) return "-";
  return entry.entry_affiliation ?? entry.players?.[0]?.affiliation ?? "-";
}

function getLeagueSourceLabel(params: {
  sourceType: string | null | undefined;
  groupNo: number | null | undefined;
  rank: number | null | undefined;
}) {
  const { sourceType, groupNo, rank } = params;
  if (sourceType !== "league_rank") return "未定";
  if (!groupNo || !rank) return "未定";
  return `${groupNo}リーグ${rank}位`;
}

function resolveSlotLabel(params: {
  entryId: string | null | undefined;
  entryMap: Map<string, EntryRow>;
  sourceType: string | null | undefined;
  sourceGroupNo: number | null | undefined;
  sourceRank: number | null | undefined;
}) {
  const { entryId, entryMap, sourceType, sourceGroupNo, sourceRank } = params;

  if (entryId) {
    return getEntryDisplayName(entryMap.get(String(entryId)));
  }

  return getLeagueSourceLabel({
    sourceType,
    groupNo: sourceGroupNo,
    rank: sourceRank,
  });
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

    const nameA = a.entry_name ?? a.players?.[0]?.name ?? "";
    const nameB = b.entry_name ?? b.players?.[0]?.name ?? "";
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

  const { data: entriesData, error: entriesError } = await supabase
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
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  if (entriesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>エントリー情報の取得に失敗しました: {entriesError.message}</p>
      </main>
    );
  }

  const entries = (entriesData ?? []) as unknown as EntryRow[];
  const sortedEntries = sortEntries(entries);

  const entryMap = new Map<string, EntryRow>();
  for (const entry of sortedEntries) {
    entryMap.set(String(entry.id), entry);
  }

  const { data: bracketsData, error: bracketsError } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId)
    .order("id", { ascending: true });

  if (bracketsError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>ブラケット情報の取得に失敗しました: {bracketsError.message}</p>
      </main>
    );
  }

  const brackets = (bracketsData ?? []) as BracketRow[];
  const bracketTypeMap = new Map<string, string | null>();
  for (const bracket of brackets) {
    bracketTypeMap.set(String(bracket.id), bracket.bracket_type ?? null);
  }

  const { data: matchesData, error: matchesError } = await supabase
    .from("matches")
    .select(`
      id,
      round_no,
      match_no,
      status,
      score_text,
      bracket_id,
      league_group_no,
      player1_entry_id,
      player2_entry_id,
      player1_source_type,
      player1_source_group_no,
      player1_source_rank,
      player2_source_type,
      player2_source_group_no,
      player2_source_rank
    `)
    .eq("division_id", divisionId)
    .neq("status", "skipped")
    .order("bracket_id", { ascending: true, nullsFirst: false })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  if (matchesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>試合情報の取得に失敗しました: {matchesError.message}</p>
      </main>
    );
  }

  const matches = (matchesData ?? []) as MatchRow[];

  const leagueMatches = matches.filter((m) => !m.bracket_id);
  const knockoutMatches = matches.filter((m) => !!m.bracket_id);

  const groupedKnockout = new Map<string, MatchRow[]>();
  for (const match of knockoutMatches) {
    const bracketId = String(match.bracket_id);
    if (!groupedKnockout.has(bracketId)) {
      groupedKnockout.set(bracketId, []);
    }
    groupedKnockout.get(bracketId)!.push(match);
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1200px" }}>
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

      <h1 style={{ marginBottom: "8px" }}>リーグ→トーナメント確認</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name}
      </p>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>エントリー一覧</h2>
        {sortedEntries.length === 0 ? (
          <p style={{ margin: 0 }}>エントリーがありません。</p>
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
              {sortedEntries.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle()}>{getEntryDisplayName(entry)}</td>
                  <td style={tdStyle()}>{getEntryDisplayAffiliation(entry)}</td>
                  <td style={tdStyleCenter()}>{entry.seed ?? "-"}</td>
                  <td style={tdStyleCenter()}>{entry.ranking_for_draw ?? "-"}</td>
                  <td style={tdStyleCenter()}>{entry.entry_rating ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: "20px" }}>
        <h2 style={sectionTitleStyle}>予選リーグ試合</h2>
        {leagueMatches.length === 0 ? (
          <p style={{ margin: 0 }}>予選リーグはまだ生成されていません。</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyleCenter()}>リーグ</th>
                <th style={thStyleCenter()}>回戦</th>
                <th style={thStyleCenter()}>試合</th>
                <th style={thStyle()}>対戦</th>
                <th style={thStyleCenter()}>状態</th>
                <th style={thStyleCenter()}>結果</th>
              </tr>
            </thead>
            <tbody>
              {leagueMatches.map((match) => (
                <tr key={match.id}>
                  <td style={tdStyleCenter()}>{match.league_group_no ?? "-"}</td>
                  <td style={tdStyleCenter()}>{match.round_no ?? "-"}</td>
                  <td style={tdStyleCenter()}>{match.match_no ?? "-"}</td>
                  <td style={tdStyle()}>
                    {resolveSlotLabel({
                      entryId: match.player1_entry_id,
                      entryMap,
                      sourceType: match.player1_source_type,
                      sourceGroupNo: match.player1_source_group_no,
                      sourceRank: match.player1_source_rank,
                    })}
                    {" vs "}
                    {resolveSlotLabel({
                      entryId: match.player2_entry_id,
                      entryMap,
                      sourceType: match.player2_source_type,
                      sourceGroupNo: match.player2_source_group_no,
                      sourceRank: match.player2_source_rank,
                    })}
                  </td>
                  <td style={tdStyleCenter()}>{match.status ?? "-"}</td>
                  <td style={tdStyleCenter()}>{match.score_text ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: "20px" }}>
        <h2 style={sectionTitleStyle}>順位別トーナメント試合</h2>
        {groupedKnockout.size === 0 ? (
          <p style={{ margin: 0 }}>順位別トーナメントはまだ生成されていません。</p>
        ) : (
          <div style={{ display: "grid", gap: "20px" }}>
            {Array.from(groupedKnockout.entries()).map(([bracketId, bracketMatches]) => (
              <div key={bracketId}>
                <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px" }}>
                  {getBracketLabel(bracketTypeMap.get(bracketId))}
                </h3>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyleCenter()}>回戦</th>
                      <th style={thStyleCenter()}>試合</th>
                      <th style={thStyle()}>対戦</th>
                      <th style={thStyleCenter()}>状態</th>
                      <th style={thStyleCenter()}>結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bracketMatches.map((match) => (
                      <tr key={match.id}>
                        <td style={tdStyleCenter()}>{match.round_no ?? "-"}</td>
                        <td style={tdStyleCenter()}>{match.match_no ?? "-"}</td>
                        <td style={tdStyle()}>
                          {resolveSlotLabel({
                            entryId: match.player1_entry_id,
                            entryMap,
                            sourceType: match.player1_source_type,
                            sourceGroupNo: match.player1_source_group_no,
                            sourceRank: match.player1_source_rank,
                          })}
                          {" vs "}
                          {resolveSlotLabel({
                            entryId: match.player2_entry_id,
                            entryMap,
                            sourceType: match.player2_source_type,
                            sourceGroupNo: match.player2_source_group_no,
                            sourceRank: match.player2_source_rank,
                          })}
                        </td>
                        <td style={tdStyleCenter()}>{match.status ?? "-"}</td>
                        <td style={tdStyleCenter()}>{match.score_text ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
};

type MatchRow = {
  id: string;
  round_no: number;
  match_no: number;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  status: string | null;
};

type EntryRow = {
  id: string;
  seed: number | null;
  entry_rating: number | null;
  ranking_for_draw: number | null;
  players:
    | {
        id: string;
        name: string | null;
        affiliation: string | null;
        rating: number | null;
      }
    | null;
  checkins:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

function getErrorMessage(error?: string) {
  if (error === "no_bracket") {
    return "先に組み合わせを生成してください。";
  }
  if (error === "has_completed_results") {
    return "すでに結果入力済みの試合があるため、修正できません。";
  }
  if (error === "invalid_entry") {
    return "不正な参加者が含まれていたため保存できませんでした。";
  }
  if (error === "duplicate_entry") {
    return "同じ参加者が複数回配置されています。";
  }
  if (error === "wrong_count") {
    return "配置された参加者数が受付済人数と一致していません。";
  }
  return "";
}

function sortCheckedInEntries(entries: EntryRow[]) {
  return [...entries].sort((a, b) => {
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;

    const drawA = a.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    const drawB = b.ranking_for_draw ?? Number.MAX_SAFE_INTEGER;
    if (drawA !== drawB) return drawA - drawB;

    const ratingA = a.entry_rating ?? a.players?.rating ?? Number.NEGATIVE_INFINITY;
    const ratingB = b.entry_rating ?? b.players?.rating ?? Number.NEGATIVE_INFINITY;
    if (ratingA !== ratingB) return ratingB - ratingA;

    return (a.players?.name ?? "").localeCompare(b.players?.name ?? "", "ja");
  });
}

export default async function DivisionBracketEditPage({
  params,
  searchParams,
}: PageProps) {
  const { tournamentId, divisionId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("id", divisionId)
    .single();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  if (!division || !tournament) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>組み合わせ修正</h1>
        <p>大会または種目が見つかりませんでした。</p>
      </main>
    );
  }

  const { data: bracket } = await supabase
    .from("brackets")
    .select("id")
    .eq("division_id", divisionId)
    .eq("bracket_type", "main")
    .maybeSingle();

  if (!bracket?.id) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}>
            ← 組み合わせへ戻る
          </Link>
        </div>
        <h1>組み合わせ修正</h1>
        <p>まだ組み合わせが生成されていません。</p>
      </main>
    );
  }

  const { data: matchesData } = await supabase
    .from("matches")
    .select(
      "id, round_no, match_no, player1_entry_id, player2_entry_id, winner_entry_id, status"
    )
    .eq("bracket_id", bracket.id)
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const matches = (matchesData ?? []) as MatchRow[];

  const firstRoundMatches = matches.filter((match: MatchRow) => match.round_no === 1);
  const hasCompletedResults = matches.some(
    (match: MatchRow) => match.status === "completed"
  );

  const { data: allEntriesData } = await supabase
    .from("entries")
    .select(`
      id,
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

  const allEntries = (allEntriesData ?? []) as EntryRow[];

  const checkedInEntries = sortCheckedInEntries(
    allEntries.filter((entry: EntryRow) => {
      const checkin = Array.isArray(entry.checkins)
        ? entry.checkins[0]
        : entry.checkins;
      return checkin?.status === "checked_in";
    })
  );

  const errorMessage = getErrorMessage(resolvedSearchParams.error);

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}>
          ← 組み合わせへ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>組み合わせ修正</h1>
      <p style={{ marginBottom: "8px" }}>大会: {tournament.name}</p>
      <p style={{ marginBottom: "24px" }}>種目: {division.name}</p>

      {errorMessage && (
        <p style={{ color: "crimson", marginBottom: "16px" }}>{errorMessage}</p>
      )}

      {resolvedSearchParams.updated && (
        <p style={{ color: "green", marginBottom: "16px" }}>
          組み合わせを修正しました。
        </p>
      )}

      <p style={{ marginBottom: "16px", color: "#555" }}>
        1回戦だけ修正できます。結果入力済みの試合がある場合は保存できません。
      </p>

      {hasCompletedResults && (
        <p style={{ color: "crimson", marginBottom: "16px" }}>
          すでに結果入力済みの試合があるため、現在は修正できません。
        </p>
      )}

      <form action="/api/brackets/update-first-round" method="post">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />

        <div style={{ display: "grid", gap: "24px" }}>
          {firstRoundMatches.map((match: MatchRow, index: number) => (
            <div
              key={match.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                maxWidth: "720px",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "16px" }}>
                1回戦 第{match.match_no}試合
              </h2>

              <div style={{ display: "grid", gap: "12px" }}>
                <div>
                  <label
                    htmlFor={`slot_${index * 2}`}
                    style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                  >
                    player1
                  </label>
                  <select
                    id={`slot_${index * 2}`}
                    name={`slot_${index * 2}`}
                    defaultValue={match.player1_entry_id ?? ""}
                    disabled={hasCompletedResults}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                    }}
                  >
                    <option value="">BYE</option>
                    {checkedInEntries.map((entry: EntryRow) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.players?.name ?? "-"}
                        {entry.players?.affiliation ? `（${entry.players.affiliation}）` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`slot_${index * 2 + 1}`}
                    style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                  >
                    player2
                  </label>
                  <select
                    id={`slot_${index * 2 + 1}`}
                    name={`slot_${index * 2 + 1}`}
                    defaultValue={match.player2_entry_id ?? ""}
                    disabled={hasCompletedResults}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                    }}
                  >
                    <option value="">BYE</option>
                    {checkedInEntries.map((entry: EntryRow) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.players?.name ?? "-"}
                        {entry.players?.affiliation ? `（${entry.players.affiliation}）` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "24px" }}>
          <button
            type="submit"
            disabled={hasCompletedResults}
            style={{
              padding: "10px 16px",
              border: "1px solid #ccc",
              borderRadius: "6px",
              background: hasCompletedResults ? "#f5f5f5" : "white",
              cursor: hasCompletedResults ? "not-allowed" : "pointer",
            }}
          >
            修正内容を保存
          </button>
        </div>
      </form>
    </main>
  );
}
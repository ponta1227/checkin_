import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
  searchParams: Promise<{
    generated?: string;
    saved?: string;
    error?: string;
  }>;
};

type EntryRow = {
  id: string;
  players:
    | {
        id: string;
        name: string | null;
        affiliation: string | null;
      }
    | null;
};

type LeagueGroupRow = {
  id: string;
  group_no: number;
  name: string;
};

type LeagueGroupMemberRow = {
  id: string;
  group_id: string;
  entry_id: string;
  slot_no: number;
};

type LeagueMatchRow = {
  id: string;
  group_id: string;
  player1_entry_id: string;
  player2_entry_id: string;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string;
};

type StandingRow = {
  entry_id: string;
  slot_no: number;
  name: string;
  affiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
};

type KnockoutBracketRow = {
  id: string;
  name: string;
  rank_from: number;
  rank_to: number;
  display_order: number;
};

type KnockoutMatchRow = {
  id: string;
  bracket_id: string;
  round_no: number;
  match_no: number;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  score_text: string | null;
  status: string;
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function parseScore(scoreText: string | null) {
  if (!scoreText) return null;
  const nums = scoreText.match(/\d+/g);
  if (!nums || nums.length < 2) return null;

  const p1 = Number(nums[0]);
  const p2 = Number(nums[1]);
  if (Number.isNaN(p1) || Number.isNaN(p2)) return null;

  return { p1, p2 };
}

function buildStandings(params: {
  groupMembers: LeagueGroupMemberRow[];
  groupMatches: LeagueMatchRow[];
  entryMap: Map<string, EntryRow>;
}) {
  const { groupMembers, groupMatches, entryMap } = params;

  const statsMap = new Map<string, StandingRow>();
  const directWinnerMap = new Map<string, string>();

  for (const member of groupMembers) {
    const entry = entryMap.get(member.entry_id);

    statsMap.set(member.entry_id, {
      entry_id: member.entry_id,
      slot_no: member.slot_no,
      name: entry?.players?.name ?? "-",
      affiliation: entry?.players?.affiliation ?? null,
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
    });
  }

  for (const match of groupMatches) {
    if (match.status !== "completed" || !match.winner_entry_id) continue;

    const p1 = statsMap.get(match.player1_entry_id);
    const p2 = statsMap.get(match.player2_entry_id);

    if (!p1 || !p2) continue;

    p1.played += 1;
    p2.played += 1;

    if (match.winner_entry_id === match.player1_entry_id) {
      p1.wins += 1;
      p2.losses += 1;
    } else if (match.winner_entry_id === match.player2_entry_id) {
      p2.wins += 1;
      p1.losses += 1;
    }

    directWinnerMap.set(
      pairKey(match.player1_entry_id, match.player2_entry_id),
      match.winner_entry_id
    );

    const parsed = parseScore(match.score_text);
    if (parsed) {
      p1.gamesWon += parsed.p1;
      p1.gamesLost += parsed.p2;
      p2.gamesWon += parsed.p2;
      p2.gamesLost += parsed.p1;
    }
  }

  const rows = [...statsMap.values()].map((row) => ({
    ...row,
    gameDiff: row.gamesWon - row.gamesLost,
  }));

  rows.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;

    const direct = directWinnerMap.get(pairKey(a.entry_id, b.entry_id));
    if (direct === a.entry_id) return -1;
    if (direct === b.entry_id) return 1;

    if (a.gameDiff !== b.gameDiff) return b.gameDiff - a.gameDiff;
    if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;

    return a.slot_no - b.slot_no;
  });

  return rows;
}

function getErrorMessage(error?: string) {
  if (error === "no_league_results") {
    return "先にリーグ戦結果を入力してください。";
  }
  if (error === "incomplete_league") {
    return "リーグ戦の未完了試合があるため、順位別トーナメントを生成できません。";
  }
  if (error === "invalid_block_line") {
    return "ブロック指定は「上位,1,2」のように入力してください。";
  }
  if (error === "block_too_few") {
    return "対象人数が2名未満のブロックがあります。";
  }
  if (error === "invalid_winner") {
    return "勝者が対戦者に含まれていません。";
  }
  if (error === "invalid_score") {
    return "スコアは「3-0」のように入力してください。";
  }
  if (error === "score_mismatch") {
    return "選択した勝者とスコアが一致していません。";
  }
  if (error === "downstream_completed") {
    return "次の試合がすでに完了しているため、この試合結果は変更できません。";
  }
  return "";
}

function getStatusLabel(status: string) {
  if (status === "ready") return "対戦可";
  if (status === "pending") return "未確定";
  if (status === "walkover") return "不戦";
  if (status === "completed") return "完了";
  return status;
}

export default async function LeagueKnockoutPage({
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
        <h1>順位別トーナメント</h1>
        <p>大会または種目が見つかりませんでした。</p>
      </main>
    );
  }

  const { data: entriesData } = await supabase
    .from("entries")
    .select(`
      id,
      players (
        id,
        name,
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .eq("status", "entered");

  const entries = (entriesData ?? []) as EntryRow[];

  const entryMap = new Map<string, EntryRow>();
  for (const entry of entries) {
    entryMap.set(entry.id, entry);
  }

  const { data: groupsData } = await supabase
    .from("league_groups")
    .select("id, group_no, name")
    .eq("division_id", divisionId)
    .order("group_no", { ascending: true });

  const groups = (groupsData ?? []) as LeagueGroupRow[];
  const groupIds = groups.map((group) => group.id);

  let members: LeagueGroupMemberRow[] = [];
  let leagueMatches: LeagueMatchRow[] = [];

  if (groupIds.length > 0) {
    const { data: membersData } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", groupIds)
      .order("slot_no", { ascending: true });

    const { data: leagueMatchesData } = await supabase
      .from("league_matches")
      .select(`
        id,
        group_id,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        score_text,
        status
      `)
      .in("group_id", groupIds);

    members = (membersData ?? []) as LeagueGroupMemberRow[];
    leagueMatches = (leagueMatchesData ?? []) as LeagueMatchRow[];
  }

  const membersByGroup = new Map<string, LeagueGroupMemberRow[]>();
  for (const member of members) {
    if (!membersByGroup.has(member.group_id)) {
      membersByGroup.set(member.group_id, []);
    }
    membersByGroup.get(member.group_id)!.push(member);
  }

  const leagueMatchesByGroup = new Map<string, LeagueMatchRow[]>();
  for (const match of leagueMatches) {
    if (!leagueMatchesByGroup.has(match.group_id)) {
      leagueMatchesByGroup.set(match.group_id, []);
    }
    leagueMatchesByGroup.get(match.group_id)!.push(match);
  }

  const standingsByGroup = new Map<string, StandingRow[]>();
  for (const group of groups) {
    standingsByGroup.set(
      group.id,
      buildStandings({
        groupMembers: membersByGroup.get(group.id) ?? [],
        groupMatches: leagueMatchesByGroup.get(group.id) ?? [],
        entryMap,
      })
    );
  }

  const { data: bracketsData } = await supabase
    .from("league_knockout_brackets")
    .select("id, name, rank_from, rank_to, display_order")
    .eq("division_id", divisionId)
    .order("display_order", { ascending: true });

  const brackets = (bracketsData ?? []) as KnockoutBracketRow[];
  const bracketIds = brackets.map((bracket) => bracket.id);

  let knockoutMatches: KnockoutMatchRow[] = [];

  if (bracketIds.length > 0) {
    const { data: knockoutMatchesData } = await supabase
      .from("league_knockout_matches")
      .select(`
        id,
        bracket_id,
        round_no,
        match_no,
        player1_entry_id,
        player2_entry_id,
        winner_entry_id,
        score_text,
        status
      `)
      .in("bracket_id", bracketIds)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });

    knockoutMatches = (knockoutMatchesData ?? []) as KnockoutMatchRow[];
  }

  const knockoutMatchesByBracket = new Map<string, KnockoutMatchRow[]>();
  for (const match of knockoutMatches) {
    if (!knockoutMatchesByBracket.has(match.bracket_id)) {
      knockoutMatchesByBracket.set(match.bracket_id, []);
    }
    knockoutMatchesByBracket.get(match.bracket_id)!.push(match);
  }

  const errorMessage = getErrorMessage(resolvedSearchParams.error);

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/league/results`}>
          ← リーグ戦結果入力・順位表へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>順位別トーナメント</h1>
      <p style={{ marginBottom: "8px" }}>大会: {tournament.name}</p>
      <p style={{ marginBottom: "24px" }}>種目: {division.name}</p>

      {errorMessage && (
        <p style={{ color: "crimson", marginBottom: "16px" }}>{errorMessage}</p>
      )}

      {resolvedSearchParams.generated && (
        <p style={{ color: "green", marginBottom: "16px" }}>
          順位別トーナメントを生成しました。
        </p>
      )}

      {resolvedSearchParams.saved && (
        <p style={{ color: "green", marginBottom: "16px" }}>
          順位別トーナメントの結果を保存しました。
        </p>
      )}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
          maxWidth: "820px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "16px" }}>順位別トーナメント生成</h2>

        <form action="/api/leagues/generate-knockout" method="post" style={{ display: "grid", gap: "16px" }}>
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="divisionId" value={divisionId} />

          <div>
            <label
              htmlFor="blockLines"
              style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
            >
              ブロック指定
            </label>
            <textarea
              id="blockLines"
              name="blockLines"
              rows={6}
              defaultValue={`上位,1,2
下位,3,4`}
              style={{
                width: "100%",
                maxWidth: "500px",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "6px",
              }}
            />
            <p style={{ marginTop: "8px", color: "#555" }}>
              1行ごとに「ブロック名,開始順位,終了順位」で入力してください。
            </p>
          </div>

          <div>
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                border: "1px solid #ccc",
                borderRadius: "6px",
                background: "white",
                cursor: "pointer",
              }}
            >
              順位別トーナメントを生成
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: "grid", gap: "32px" }}>
        {groups.map((group) => {
          const standings = standingsByGroup.get(group.id) ?? [];

          return (
            <div
              key={group.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px" }}>{group.name} 現在順位</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>順位</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>番号</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>氏名</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>勝</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>敗</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>差</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, index) => (
                    <tr key={row.entry_id}>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{index + 1}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{row.slot_no}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{row.name}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{row.wins}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{row.losses}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "8px" }}>{row.gameDiff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: "32px", marginTop: "32px" }}>
        {brackets.length === 0 ? (
          <p>まだ順位別トーナメントは生成されていません。</p>
        ) : (
          brackets.map((bracket) => {
            const bracketMatches = knockoutMatchesByBracket.get(bracket.id) ?? [];
            const rounds = new Map<number, KnockoutMatchRow[]>();

            for (const match of bracketMatches) {
              if (!rounds.has(match.round_no)) {
                rounds.set(match.round_no, []);
              }
              rounds.get(match.round_no)!.push(match);
            }

            const roundEntries = [...rounds.entries()].sort((a, b) => a[0] - b[0]);

            return (
              <div
                key={bracket.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: "8px" }}>
                  {bracket.name}（{bracket.rank_from}位〜{bracket.rank_to}位）
                </h2>

                {roundEntries.length === 0 ? (
                  <p>試合がありません。</p>
                ) : (
                  <div style={{ display: "grid", gap: "24px" }}>
                    {roundEntries.map(([roundNo, roundMatches]) => (
                      <div key={roundNo}>
                        <h3 style={{ marginBottom: "8px" }}>{roundNo}回戦</h3>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>試合</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>player1</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>player2</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>状態</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>勝者</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>スコア</th>
                              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px" }}>入力</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roundMatches.map((match) => {
                              const p1 = match.player1_entry_id
                                ? entryMap.get(match.player1_entry_id)
                                : null;
                              const p2 = match.player2_entry_id
                                ? entryMap.get(match.player2_entry_id)
                                : null;
                              const winner = match.winner_entry_id
                                ? entryMap.get(match.winner_entry_id)
                                : null;

                              return (
                                <tr key={match.id}>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {match.match_no}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {p1?.players?.name ?? (match.player2_entry_id ? "BYE" : "-")}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {p2?.players?.name ?? (match.player1_entry_id ? "BYE" : "-")}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {getStatusLabel(match.status)}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {winner?.players?.name ?? "-"}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {match.score_text ?? "-"}
                                  </td>
                                  <td style={{ borderBottom: "1px solid #eee", padding: "8px", verticalAlign: "top" }}>
                                    {match.status === "walkover" ? (
                                      <div>不戦勝で自動決定</div>
                                    ) : !match.player1_entry_id || !match.player2_entry_id ? (
                                      <div>対戦者確定待ち</div>
                                    ) : (
                                      <form action="/api/leagues/report-knockout" method="post" style={{ display: "grid", gap: "8px" }}>
                                        <input type="hidden" name="tournamentId" value={tournamentId} />
                                        <input type="hidden" name="divisionId" value={divisionId} />
                                        <input type="hidden" name="knockoutMatchId" value={match.id} />

                                        <select
                                          name="winnerEntryId"
                                          defaultValue={match.winner_entry_id ?? ""}
                                          required
                                          style={{
                                            padding: "8px",
                                            border: "1px solid #ccc",
                                            borderRadius: "6px",
                                          }}
                                        >
                                          <option value="">勝者を選択</option>
                                          <option value={match.player1_entry_id}>
                                            {p1?.players?.name ?? "-"}
                                          </option>
                                          <option value={match.player2_entry_id}>
                                            {p2?.players?.name ?? "-"}
                                          </option>
                                        </select>

                                        <input
                                          type="text"
                                          name="scoreText"
                                          defaultValue={match.score_text ?? ""}
                                          placeholder="例: 3-1"
                                          style={{
                                            padding: "8px",
                                            border: "1px solid #ccc",
                                            borderRadius: "6px",
                                          }}
                                        />

                                        <button
                                          type="submit"
                                          style={{
                                            padding: "8px 12px",
                                            border: "1px solid #ccc",
                                            borderRadius: "6px",
                                            background: "white",
                                            cursor: "pointer",
                                          }}
                                        >
                                          保存
                                        </button>
                                      </form>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
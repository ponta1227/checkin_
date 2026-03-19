import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamMatchTableAssignmentClient from "@/components/TeamMatchTableAssignmentClient";
import TournamentMatchCourtInlineClient from "@/components/TournamentMatchCourtInlineClient";
import { formatLeagueSourceLabel } from "@/lib/team/displaySources";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

function getMatchStatusLabel(status: string | null | undefined) {
  if (status === "completed") return "結果確定済";
  if (status === "in_progress") return "試合中";
  if (status === "ready") return "入力可能";
  if (status === "pending") return "待機中";
  return status ?? "-";
}

function getOrderStatusLabel(params: {
  hasTeam1: boolean;
  hasTeam2: boolean;
}) {
  const { hasTeam1, hasTeam2 } = params;
  if (hasTeam1 && hasTeam2) return "両チーム提出済";
  if (hasTeam1 || hasTeam2) return "片方のみ提出済";
  return "未提出";
}

function getBracketLabel(bracketType: string) {
  if (bracketType === "league") return "リーグ";
  if (bracketType === "main") return "本戦";
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType || "-";
}

function resolveDisplayName(params: {
  entryId: string | null | undefined;
  entryMap: Map<
    string,
    {
      id: string;
      entry_name: string | null;
      entry_affiliation: string | null;
    }
  >;
  sourceType: string | null | undefined;
  sourceGroupNo: number | null | undefined;
  sourceRank: number | null | undefined;
}) {
  const { entryId, entryMap, sourceType, sourceGroupNo, sourceRank } = params;

  if (entryId) {
    return entryMap.get(String(entryId))?.entry_name ?? "未定";
  }

  return formatLeagueSourceLabel({
    sourceType,
    groupNo: sourceGroupNo,
    rank: sourceRank,
  });
}

function getCardTextColor(params: {
  status: string | null | undefined;
  team1Name: string;
  team2Name: string;
  assignedCourts: number[];
}) {
  const { status, team1Name, team2Name, assignedCourts } = params;

  if (status === "completed") return "#888";
  const ready = team1Name !== "未定" && team2Name !== "未定";
  if (!ready) return "#222";
  if (assignedCourts.length > 0) return "#245dff";
  return "#d11";
}

export default async function DivisionMatchesPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, table_count")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, team_match_format, format")
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  if (division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  const { data: entries } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      status,
      checkins (
        id,
        status
      )
    `)
    .eq("division_id", divisionId)
    .order("ranking_for_draw", { ascending: true, nullsFirst: false })
    .order("affiliation_order", { ascending: true, nullsFirst: false })
    .order("entry_name", { ascending: true });

  const checkedInCount = (entries ?? []).filter((entry) => {
    const checkin = Array.isArray(entry.checkins)
      ? entry.checkins[0]
      : (entry.checkins as { id: string; status: string | null } | null);
    return entry.status !== "withdrawn" && checkin?.status === "checked_in";
  }).length;

  const activeEntryCount = (entries ?? []).filter(
    (entry) => entry.status !== "withdrawn"
  ).length;

  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id,
      round_no,
      match_no,
      table_no,
      status,
      score_text,
      player1_entry_id,
      player2_entry_id,
      winner_entry_id,
      bracket_id,
      league_group_no,
      player1_source_type,
      player1_source_group_no,
      player1_source_rank,
      player2_source_type,
      player2_source_group_no,
      player2_source_rank
    `)
    .eq("division_id", divisionId)
    .neq("status", "skipped")
    .order("league_group_no", { ascending: true, nullsFirst: false })
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  const bracketTypeMap = new Map<string, string>();
  for (const bracket of brackets ?? []) {
    bracketTypeMap.set(bracket.id, String(bracket.bracket_type ?? ""));
  }

  const leagueMatches = (matches ?? []).filter((m) => !m.bracket_id);
  const allLeagueCompleted =
    leagueMatches.length > 0 &&
    leagueMatches.every((m) => m.status === "completed");

  const hasKnockoutGenerated = (brackets ?? []).some((b) => {
    const type = String(b.bracket_type ?? "");
    return type === "upper" || type === "lower" || /^rank_\d+$/.test(type);
  });

  const entryIds = Array.from(
    new Set(
      (matches ?? [])
        .flatMap((m) => [m.player1_entry_id, m.player2_entry_id, m.winner_entry_id])
        .filter(Boolean)
    )
  ) as string[];

  const { data: matchEntries } =
    entryIds.length > 0
      ? await supabase
          .from("entries")
          .select("id, entry_name, entry_affiliation")
          .in("id", entryIds)
      : {
          data: [] as Array<{
            id: string;
            entry_name: string | null;
            entry_affiliation: string | null;
          }>,
        };

  const entryMap = new Map((matchEntries ?? []).map((e) => [e.id, e]));

  const matchIds = (matches ?? []).map((m) => m.id);

  const { data: orders } =
    matchIds.length > 0
      ? await supabase
          .from("team_match_orders")
          .select("id, team_match_id, entry_id, is_locked")
          .in("team_match_id", matchIds)
      : {
          data: [] as Array<{
            id: string;
            team_match_id: string;
            entry_id: string;
            is_locked: boolean | null;
          }>,
        };

  const { data: tableAssignments } =
    matchIds.length > 0
      ? await supabase
          .from("match_table_assignments")
          .select("match_id, slot_no, table_no")
          .in("match_id", matchIds)
          .order("slot_no", { ascending: true })
      : {
          data: [] as Array<{
            match_id: string;
            slot_no: number;
            table_no: number;
          }>,
        };

  const assignmentMap = new Map<string, number[]>();
  for (const row of tableAssignments ?? []) {
    if (!assignmentMap.has(row.match_id)) assignmentMap.set(row.match_id, []);
    assignmentMap.get(row.match_id)!.push(row.table_no);
  }

  const leagueGroupNos = Array.from(
    new Set(
      (matches ?? [])
        .map((m) => m.league_group_no)
        .filter((v): v is number => Number.isInteger(v))
    )
  );

  const { data: leagueCourtAssignments } =
    leagueGroupNos.length > 0
      ? await supabase
          .from("division_league_court_assignments")
          .select("division_id, league_group_no, slot_no, court_no")
          .eq("division_id", divisionId)
          .in("league_group_no", leagueGroupNos)
          .order("slot_no", { ascending: true })
      : {
          data: [] as Array<{
            division_id: string;
            league_group_no: number;
            slot_no: number;
            court_no: number;
          }>,
        };

  const leagueCourtMap = new Map<number, number[]>();
  for (const row of leagueCourtAssignments ?? []) {
    if (!leagueCourtMap.has(row.league_group_no)) {
      leagueCourtMap.set(row.league_group_no, []);
    }
    leagueCourtMap.get(row.league_group_no)!.push(row.court_no);
  }

  const orderMap = new Map<string, { team1: boolean; team2: boolean }>();

  for (const match of matches ?? []) {
    orderMap.set(match.id, { team1: false, team2: false });
  }

  for (const order of orders ?? []) {
    const match = (matches ?? []).find((m) => m.id === order.team_match_id);
    if (!match) continue;

    const row = orderMap.get(match.id);
    if (!row) continue;

    if (order.entry_id === match.player1_entry_id && order.is_locked) {
      row.team1 = true;
    }
    if (order.entry_id === match.player2_entry_id && order.is_locked) {
      row.team2 = true;
    }
  }

  const leagueRows = Array.from(
    new Set(
      (matches ?? [])
        .filter((m) => !m.bracket_id && Number.isInteger(m.league_group_no))
        .map((m) => Number(m.league_group_no))
    )
  )
    .sort((a, b) => a - b)
    .map((leagueGroupNo) => ({
      leagueGroupNo,
      assignedCourts: leagueCourtMap.get(leagueGroupNo) ?? [],
    }));

  const knockoutRows = (matches ?? [])
    .filter((m) => !!m.bracket_id)
    .map((match) => {
      const bracketType = match.bracket_id
        ? bracketTypeMap.get(match.bracket_id) ?? "main"
        : "league";

      return {
        matchId: match.id,
        bracketLabel: getBracketLabel(bracketType),
        leagueGroupNo: match.league_group_no ?? null,
        roundNo: match.round_no ?? null,
        matchNo: match.match_no ?? null,
        team1Name: resolveDisplayName({
          entryId: match.player1_entry_id,
          entryMap,
          sourceType: match.player1_source_type,
          sourceGroupNo: match.player1_source_group_no,
          sourceRank: match.player1_source_rank,
        }),
        team2Name: resolveDisplayName({
          entryId: match.player2_entry_id,
          entryMap,
          sourceType: match.player2_source_type,
          sourceGroupNo: match.player2_source_group_no,
          sourceRank: match.player2_source_rank,
        }),
        status: match.status,
        scoreText: match.score_text,
        assignedCourts: assignmentMap.get(match.id) ?? [],
      };
    });

  return (
    <main style={{ padding: "24px", maxWidth: "1400px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目管理へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦 試合一覧</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "12px" }}>
        大会: {tournament?.name ?? "-"} / 種目: {division.name} / 形式:{" "}
        {division.team_match_format ?? "-"}
      </p>

      <p style={{ marginTop: 0, color: "#666", marginBottom: "20px" }}>
        試合形式: {division.format} / 受付済チーム数: {checkedInCount} / 棄権を除く総チーム数:{" "}
        {activeEntryCount}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          使用コート数設定
        </h2>

        <form
          action="/api/tournaments/update-table-count"
          method="post"
          style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}
        >
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input
            type="hidden"
            name="returnPath"
            value={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
          />

          <label>
            使用コート数
            <input
              type="number"
              name="tableCount"
              min={0}
              defaultValue={Number(tournament?.table_count ?? 0)}
              style={smallInputStyle()}
            />
          </label>

          <button type="submit" style={submitButtonStyle()}>
            使用コート数を保存
          </button>
        </form>
      </section>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        {(division.format === "league" || division.format === "league_then_knockout") && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/league`}
            style={linkButtonStyle()}
          >
            リーグ表UIへ
          </Link>
        )}

        {(division.format === "knockout" ||
          (division.format === "league_then_knockout" && hasKnockoutGenerated)) && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`}
            style={linkButtonStyle()}
          >
            トーナメントUIへ
          </Link>
        )}

        {(division.format === "league" || division.format === "league_then_knockout") && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/team-league`}
            style={linkButtonStyle()}
          >
            リーグ表印刷
          </Link>
        )}

        {(division.format === "knockout" ||
          (division.format === "league_then_knockout" && hasKnockoutGenerated)) && (
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/print/team-bracket`}
            style={linkButtonStyle()}
          >
            トーナメント表印刷
          </Link>
        )}
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          試合生成
        </h2>

        {division.format === "league_then_knockout" ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <form
              action="/api/team-matches/generate-league-knockout"
              method="post"
              style={{ display: "grid", gap: "12px" }}
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="divisionId" value={divisionId} />
              <input type="hidden" name="actionType" value="generate_league" />

              <div style={{ fontWeight: 700 }}>予選リーグ生成</div>

              <div style={{ display: "grid", gap: "8px" }}>
                <label>
                  基準リーグ人数
                  <input
                    type="number"
                    name="baseLeagueSize"
                    min={2}
                    defaultValue={3}
                    style={smallInputStyle()}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <div>余りが出たときの扱い</div>
                <label style={radioLabelStyle()}>
                  <input
                    type="radio"
                    name="remainderPolicy"
                    value="allow_smaller"
                    defaultChecked
                  />
                  少ないリーグを許容
                </label>
                <label style={radioLabelStyle()}>
                  <input type="radio" name="remainderPolicy" value="allow_larger" />
                  多いリーグを許容
                </label>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <div>生成対象</div>
                <label style={radioLabelStyle()}>
                  <input
                    type="radio"
                    name="generationTarget"
                    value="checked_in_only"
                    defaultChecked
                  />
                  受付済みのみ
                </label>
                <label style={radioLabelStyle()}>
                  <input type="radio" name="generationTarget" value="all_entered" />
                  エントリー済み全チーム
                </label>
              </div>

              <div>
                <button type="submit" style={submitButtonStyle()}>
                  予選リーグを生成
                </button>
              </div>
            </form>

            <form
              action="/api/team-matches/generate-league-knockout"
              method="post"
              style={{ display: "grid", gap: "12px" }}
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="divisionId" value={divisionId} />
              <input type="hidden" name="actionType" value="generate_knockout" />

              <div style={{ fontWeight: 700 }}>順位別トーナメント生成</div>

              <div style={{ display: "grid", gap: "8px" }}>
                <div>生成方式</div>
                <label style={radioLabelStyle()}>
                  <input
                    type="radio"
                    name="knockoutMode"
                    value="upper_lower"
                    defaultChecked
                  />
                  上位・下位
                </label>
                <label style={radioLabelStyle()}>
                  <input type="radio" name="knockoutMode" value="rank_based" />
                  順位別
                </label>
              </div>

              <div
                style={{
                  padding: "12px",
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  background: "#fafafa",
                  color: "#555",
                  lineHeight: 1.6,
                }}
              >
                リーグ戦がすべて終了していなくても生成できます。
                <br />
                現在の状態:{" "}
                {leagueMatches.length === 0
                  ? "リーグ戦未生成"
                  : allLeagueCompleted
                    ? "リーグ戦完了"
                    : "リーグ戦進行中"}
                {" / "}
                {hasKnockoutGenerated ? "トーナメント生成済み" : "未生成"}
              </div>

              <div>
                <button type="submit" style={submitButtonStyle()}>
                  順位別トーナメントを生成
                </button>
              </div>
            </form>

            {hasKnockoutGenerated && (
              <form
                action="/api/team-matches/resolve-league-sources-and-redirect"
                method="post"
                style={{ display: "grid", gap: "12px" }}
              >
                <input type="hidden" name="tournamentId" value={tournamentId} />
                <input type="hidden" name="divisionId" value={divisionId} />
                <input
                  type="hidden"
                  name="returnPath"
                  value={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
                />

                <div style={{ fontWeight: 700 }}>リーグ順位の反映</div>

                <div
                  style={{
                    padding: "12px",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                    background: "#fafafa",
                    color: "#555",
                    lineHeight: 1.6,
                  }}
                >
                  `1リーグ1位` などの仮枠を、現在のリーグ順位に基づいて
                  実際のチームへ反映します。
                </div>

                <div>
                  <button type="submit" style={submitButtonStyle()}>
                    リーグ順位をトーナメントへ反映
                  </button>
                </div>
              </form>
            )}

            <section
              style={{
                border: "1px dashed #ccc",
                borderRadius: "10px",
                padding: "16px",
                background: "#fafafa",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "16px" }}>
                テスト用一括入力
              </h3>

              <p style={{ marginTop: 0, color: "#666", lineHeight: 1.6 }}>
                動作確認用です。未入力試合を自動で勝敗確定します。
                <br />
                本番運用では使わない想定です。
              </p>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <form action="/api/team-matches/fill-test-results" method="post">
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <input type="hidden" name="divisionId" value={divisionId} />
                  <input type="hidden" name="scope" value="league_only" />
                  <button type="submit" style={submitButtonStyle()}>
                    予選リーグ未入力分を一括確定
                  </button>
                </form>

                <form action="/api/team-matches/fill-test-results" method="post">
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <input type="hidden" name="divisionId" value={divisionId} />
                  <input type="hidden" name="scope" value="all" />
                  <button type="submit" style={submitButtonStyle()}>
                    全未入力試合を一括確定
                  </button>
                </form>
              </div>
            </section>
          </div>
        ) : division.format === "league" ? (
          <form
            action="/api/team-matches/generate"
            method="post"
            style={{ display: "grid", gap: "12px" }}
          >
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="divisionId" value={divisionId} />

            <p style={{ margin: 0, color: "#666" }}>
              総当たりのリーグ戦を生成します。棄権チームは常に除外されます。
            </p>

            <div style={{ display: "grid", gap: "8px" }}>
              <label style={radioLabelStyle()}>
                <input
                  type="radio"
                  name="generationTarget"
                  value="checked_in_only"
                  defaultChecked
                />
                受付済みチームのみで生成
              </label>
              <label style={radioLabelStyle()}>
                <input type="radio" name="generationTarget" value="all_entered" />
                エントリー済み全チームで生成（未受付も含む）
              </label>
            </div>

            <div>
              <button type="submit" style={submitButtonStyle()}>
                団体戦リーグ試合を生成
              </button>
            </div>
          </form>
        ) : division.format === "knockout" ? (
          <form
            action="/api/team-matches/generate"
            method="post"
            style={{ display: "grid", gap: "12px" }}
          >
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="divisionId" value={divisionId} />

            <p style={{ margin: 0, color: "#666" }}>
              シード順を優先してトーナメントを生成します。棄権チームは常に除外されます。
            </p>

            <div style={{ display: "grid", gap: "8px" }}>
              <label style={radioLabelStyle()}>
                <input
                  type="radio"
                  name="generationTarget"
                  value="checked_in_only"
                  defaultChecked
                />
                受付済みチームのみで生成
              </label>
              <label style={radioLabelStyle()}>
                <input type="radio" name="generationTarget" value="all_entered" />
                エントリー済み全チームで生成（未受付も含む）
              </label>
            </div>

            <div>
              <button type="submit" style={submitButtonStyle()}>
                団体戦トーナメントを生成
              </button>
            </div>
          </form>
        ) : (
          <p style={{ margin: 0, color: "#666" }}>
            今回の修正は団体戦 league / knockout / league_then_knockout 向けです。
          </p>
        )}
      </section>

      <TeamMatchTableAssignmentClient
        tournamentId={tournamentId}
        divisionId={divisionId}
        courtCount={Number(tournament?.table_count ?? 0)}
        leagueRows={leagueRows}
      />

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          overflow: "hidden",
          marginTop: "20px",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #eee",
            fontWeight: 700,
          }}
        >
          試合一覧
        </div>

        {matches && matches.length > 0 ? (
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
                  <th style={thStyle()}>区分</th>
                  <th style={thStyle()}>リーグ</th>
                  <th style={thStyle()}>回戦</th>
                  <th style={thStyle()}>試合番号</th>
                  <th style={{ ...thStyle(), textAlign: "left" }}>対戦カード</th>
                  <th style={thStyle()}>オーダー</th>
                  <th style={thStyle()}>試合状態</th>
                  <th style={thStyle()}>結果</th>
                  <th style={thStyle()}>コート</th>
                  <th style={thStyle()}>操作</th>
                </tr>
              </thead>

              <tbody>
                {(matches ?? []).map((match) => {
                  const team1Name = resolveDisplayName({
                    entryId: match.player1_entry_id,
                    entryMap,
                    sourceType: match.player1_source_type,
                    sourceGroupNo: match.player1_source_group_no,
                    sourceRank: match.player1_source_rank,
                  });

                  const team2Name = resolveDisplayName({
                    entryId: match.player2_entry_id,
                    entryMap,
                    sourceType: match.player2_source_type,
                    sourceGroupNo: match.player2_source_group_no,
                    sourceRank: match.player2_source_rank,
                  });

                  const orderState = orderMap.get(match.id) ?? {
                    team1: false,
                    team2: false,
                  };

                  const bracketType = match.bracket_id
                    ? bracketTypeMap.get(match.bracket_id) ?? "main"
                    : "league";

                  const assignedCourts = match.bracket_id
                    ? assignmentMap.get(match.id) ?? []
                    : leagueCourtMap.get(Number(match.league_group_no ?? 0)) ?? [];

                  return (
                    <tr key={match.id}>
                      <td style={tdStyle("center")}>{getBracketLabel(bracketType)}</td>
                      <td style={tdStyle("center")}>{match.league_group_no ?? "-"}</td>
                      <td style={tdStyle("center")}>{match.round_no}</td>
                      <td style={tdStyle("center")}>{match.match_no}</td>

                      <td style={{ ...tdStyle("left"), verticalAlign: "top" }}>
                        <div
                          style={{
                            color: getCardTextColor({
                              status: match.status,
                              team1Name,
                              team2Name,
                              assignedCourts,
                            }),
                            fontWeight: 700,
                          }}
                        >
                          {team1Name} vs {team2Name}
                        </div>

                        <div style={{ marginTop: "4px", color: "#666", fontSize: "12px" }}>
                          コート: {assignedCourts.length > 0 ? assignedCourts.join(", ") : "-"}
                        </div>
                      </td>

                      <td style={tdStyle("center")}>
                        {match.player1_entry_id && match.player2_entry_id
                          ? getOrderStatusLabel({
                              hasTeam1: orderState.team1,
                              hasTeam2: orderState.team2,
                            })
                          : "未確定"}
                      </td>

                      <td style={tdStyle("center")}>
                        {getMatchStatusLabel(match.status)}
                      </td>

                      <td style={tdStyle("center")}>{match.score_text ?? "-"}</td>

                      <td style={tdStyle("center")}>
                        {match.bracket_id ? (
                          <TournamentMatchCourtInlineClient
                            tournamentId={tournamentId}
                            divisionId={divisionId}
                            matchId={match.id}
                            courtCount={Number(tournament?.table_count ?? 0)}
                            assignedCourts={assignmentMap.get(match.id) ?? []}
                            allTournamentAssignments={knockoutRows.map((row) => ({
                              matchId: row.matchId,
                              assignedCourts: row.assignedCourts,
                            }))}
                          />
                        ) : assignedCourts.length > 0 ? (
                          assignedCourts.map((n) => `${n}コート`).join(", ")
                        ) : (
                          "-"
                        )}
                      </td>

                      <td style={tdStyle("center")}>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          {match.player1_entry_id && match.player2_entry_id ? (
                            <>
                              <Link
                                href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${match.id}/team-order`}
                                style={miniLinkButtonStyle()}
                              >
                                オーダー提出
                              </Link>

                              <Link
                                href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches/${match.id}/team-score`}
                                style={miniLinkButtonStyle()}
                              >
                                結果入力
                              </Link>
                            </>
                          ) : (
                            <span style={{ color: "#666", fontSize: "12px" }}>
                              順位反映後に操作可能
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "16px", color: "#666" }}>
            まだ試合は生成されていません。
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

function miniLinkButtonStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    color: "inherit",
    textDecoration: "none",
    whiteSpace: "nowrap",
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

function smallInputStyle(): React.CSSProperties {
  return {
    marginLeft: "8px",
    width: "80px",
    padding: "6px 8px",
    border: "1px solid #ccc",
    borderRadius: "8px",
  };
}

function radioLabelStyle(): React.CSSProperties {
  return {
    display: "flex",
    gap: "8px",
    alignItems: "flex-start",
  };
}

function thStyle(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #eee",
    textAlign: "center",
  };
}

function tdStyle(align: "left" | "center"): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #f0f0f0",
    textAlign: align,
    verticalAlign: "top",
  };
}
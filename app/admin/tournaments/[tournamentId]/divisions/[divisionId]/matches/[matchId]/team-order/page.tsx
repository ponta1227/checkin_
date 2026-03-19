import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTeamMatchBoards } from "@/lib/team/buildTeamMatchBoards";
import { buildOrderLineLabel, countTeamWinsAfterBoard4 } from "@/lib/team/order";
import TeamOrderFormsClient from "@/components/TeamOrderFormsClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
    matchId: string;
  }>;
  searchParams: Promise<{
    team?: string;
    submitted?: string;
    fifth_submitted?: string;
  }>;
};

function isTeamChoice(value?: string): value is "team1" | "team2" {
  return value === "team1" || value === "team2";
}

export default async function TeamOrderPage({
  params,
  searchParams,
}: PageProps) {
  const { tournamentId, divisionId, matchId } = await params;
  const resolvedSearchParams = await searchParams;
  const teamChoice = resolvedSearchParams.team;

  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, team_match_format")
    .eq("id", divisionId)
    .single();

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <p>この種目は団体戦ではありません。</p>
      </main>
    );
  }

  const format = String(division.team_match_format ?? "");
  const boards = buildTeamMatchBoards(format);

  const { data: match } = await supabase
    .from("matches")
    .select(`
      id,
      division_id,
      player1_entry_id,
      player2_entry_id,
      status
    `)
    .eq("id", matchId)
    .eq("division_id", divisionId)
    .single();

  if (!match) {
    return (
      <main style={{ padding: "24px" }}>
        <p>試合が見つかりませんでした。</p>
      </main>
    );
  }

  const entryIds = [match.player1_entry_id, match.player2_entry_id].filter(Boolean) as string[];

  const { data: entries } = await supabase
    .from("entries")
    .select("id, entry_name, entry_affiliation")
    .in("id", entryIds);

  const entryMap = new Map((entries ?? []).map((e) => [e.id, e]));
  const team1 = match.player1_entry_id ? entryMap.get(match.player1_entry_id) : null;
  const team2 = match.player2_entry_id ? entryMap.get(match.player2_entry_id) : null;

  const { data: orders } = await supabase
    .from("team_match_orders")
    .select(`
      id,
      entry_id,
      submitted_at,
      is_locked,
      order_json
    `)
    .eq("team_match_id", matchId);

  const orderMap = new Map((orders ?? []).map((o) => [o.entry_id, o]));

  const bothSubmitted =
    !!match.player1_entry_id &&
    !!match.player2_entry_id &&
    !!orderMap.get(match.player1_entry_id)?.is_locked &&
    !!orderMap.get(match.player2_entry_id)?.is_locked;

  const { data: orderLines } = await supabase
    .from("team_match_order_lines")
    .select(`
      id,
      team_match_order_id,
      board_no,
      match_type,
      member1_id,
      member2_id
    `)
    .in("team_match_order_id", (orders ?? []).map((o) => o.id));

  const orderLinesByOrderId = new Map<string, any[]>();
  for (const line of orderLines ?? []) {
    const orderId = line.team_match_order_id;
    if (!orderLinesByOrderId.has(orderId)) {
      orderLinesByOrderId.set(orderId, []);
    }
    orderLinesByOrderId.get(orderId)!.push(line);
  }

  const selectedEntryId =
    teamChoice === "team1"
      ? match.player1_entry_id
      : teamChoice === "team2"
      ? match.player2_entry_id
      : null;

  const { data: selectedTeamMembers } =
    selectedEntryId
      ? await supabase
          .from("team_members")
          .select("id, name, affiliation, member_order")
          .eq("entry_id", selectedEntryId)
          .order("member_order", { ascending: true })
      : { data: [] as any[] };

  const allOrderMemberIds = new Set<string>();
  for (const line of orderLines ?? []) {
    if (line.member1_id) allOrderMemberIds.add(line.member1_id);
    if (line.member2_id) allOrderMemberIds.add(line.member2_id);
  }

  const { data: allMembers } =
    allOrderMemberIds.size > 0
      ? await supabase
          .from("team_members")
          .select("id, name")
          .in("id", [...allOrderMemberIds])
      : { data: [] as any[] };

  const allMemberNameMap = new Map<string, string>();
  for (const m of allMembers ?? []) {
    allMemberNameMap.set(m.id, m.name);
  }

  const { data: teamGames } = await supabase
    .from("team_match_games")
    .select("board_no, winner_side")
    .eq("team_match_id", matchId)
    .order("board_no", { ascending: true });

  const { team1Wins, team2Wins } = countTeamWinsAfterBoard4(teamGames ?? []);
  const canSubmitFifth =
    format === "T_LEAGUE" &&
    bothSubmitted &&
    team1Wins === 2 &&
    team2Wins === 2 &&
    isTeamChoice(teamChoice) &&
    !!selectedEntryId;

  function renderOrderBlock(entryId: string | null, teamLabel: string) {
    if (!entryId) {
      return (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h3 style={{ marginTop: 0 }}>{teamLabel}</h3>
          <p>チーム未確定</p>
        </div>
      );
    }

    const entry = entryMap.get(entryId);
    const order = orderMap.get(entryId);

    if (!bothSubmitted) {
      return (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h3 style={{ marginTop: 0 }}>{entry?.entry_name ?? teamLabel}</h3>
          <p style={{ marginBottom: 0 }}>
            {order?.is_locked ? "提出済（相手の提出待ち）" : "未提出"}
          </p>
        </div>
      );
    }

    const lines = [...(orderLinesByOrderId.get(order?.id ?? "") ?? [])].sort(
      (a, b) => a.board_no - b.board_no
    );

    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
          {entry?.entry_name ?? teamLabel}
        </h3>

        <div style={{ display: "grid", gap: "8px" }}>
          {boards.map((board) => {
            const line = lines.find((l) => l.board_no === board.boardNo);
            const memberNames = [
              line?.member1_id ? allMemberNameMap.get(line.member1_id) ?? "-" : "",
              line?.member2_id ? allMemberNameMap.get(line.member2_id) ?? "-" : "",
            ].filter(Boolean);

            const label =
              line && memberNames.length > 0
                ? buildOrderLineLabel({
                    matchType: line.match_type,
                    memberNames,
                  })
                : "未入力";

            return (
              <div
                key={board.boardNo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: "8px",
                  padding: "8px 0",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {board.boardNo}番 ({board.type})
                </div>
                <div>{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1100px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}>
          ← 試合一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦オーダー提出</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "18px" }}>
        種目: {division.name} / 形式: {format}
      </p>

      {resolvedSearchParams.submitted === "1" && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            border: "1px solid #cfe8cf",
            background: "#f6fff6",
            borderRadius: "8px",
          }}
        >
          初回オーダーを提出しました。
        </div>
      )}

      {resolvedSearchParams.fifth_submitted === "1" && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            border: "1px solid #cfe8cf",
            background: "#f6fff6",
            borderRadius: "8px",
          }}
        >
          5番オーダーを提出しました。
        </div>
      )}

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
          対戦カード
        </h2>
        <p style={{ margin: 0 }}>
          {team1?.entry_name ?? "チーム1未定"} vs {team2?.entry_name ?? "チーム2未定"}
        </p>
      </section>

      {!isTeamChoice(teamChoice) ? (
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
            どちらのチームですか？
          </h2>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link
              href={`?team=team1`}
              style={{
                display: "inline-block",
                padding: "10px 14px",
                border: "1px solid #ccc",
                borderRadius: "8px",
                background: "white",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {team1?.entry_name ?? "チーム1"}
            </Link>

            <Link
              href={`?team=team2`}
              style={{
                display: "inline-block",
                padding: "10px 14px",
                border: "1px solid #ccc",
                borderRadius: "8px",
                background: "white",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {team2?.entry_name ?? "チーム2"}
            </Link>
          </div>
        </section>
      ) : (
        <TeamOrderFormsClient
          tournamentId={tournamentId}
          divisionId={divisionId}
          matchId={matchId}
          teamChoice={teamChoice}
          boards={boards}
          selectedTeamMembers={selectedTeamMembers ?? []}
          initialOrderLocked={!!(selectedEntryId && orderMap.get(selectedEntryId)?.is_locked)}
          format={format}
          canSubmitFifth={canSubmitFifth}
        />
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        {renderOrderBlock(match.player1_entry_id, "チーム1")}
        {renderOrderBlock(match.player2_entry_id, "チーム2")}
      </section>

      {!bothSubmitted && (
        <p style={{ marginTop: "16px", color: "#666" }}>
          両チームのオーダー提出が完了するまで、オーダー内容は表示されません。
        </p>
      )}
    </main>
  );
}
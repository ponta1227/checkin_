import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

type CheckinRow = {
  id: string;
  status: string | null;
  member_confirmed: boolean | null;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_affiliation: string | null;
  ranking_for_draw: number | null;
  affiliation_order: number | null;
  status: string | null;
  checkins: CheckinRow[] | null;
};

type DivisionRow = {
  id: string;
  name: string;
  event_type: string | null;
  team_match_format: string | null;
  team_member_required: boolean | null;
  team_member_count_min: number | null;
  team_member_count_max: number | null;
};

type TeamMemberRow = {
  id: string;
  entry_id: string;
  name: string;
  affiliation: string | null;
  member_order: number | null;
};

function getCheckinLabel(status: string | null | undefined) {
  if (status === "checked_in") return "受付済";
  if (status === "withdrawn") return "棄権";
  return "未受付";
}

function getCheckinColor(status: string | null | undefined) {
  if (status === "checked_in") return "green";
  if (status === "withdrawn") return "crimson";
  return "#666";
}

export default async function TeamDivisionCheckinPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: divisionData } = await supabase
    .from("divisions")
    .select(`
      id,
      name,
      event_type,
      team_match_format,
      team_member_required,
      team_member_count_min,
      team_member_count_max
    `)
    .eq("id", divisionId)
    .single();

  const division = divisionData as DivisionRow | null;

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>この種目は団体戦ではありません。</p>
      </main>
    );
  }

  const { data: entriesData } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      ranking_for_draw,
      affiliation_order,
      status,
      checkins (
        id,
        status,
        member_confirmed
      )
    `)
    .eq("division_id", divisionId)
    .order("ranking_for_draw", { ascending: true, nullsFirst: false })
    .order("affiliation_order", { ascending: true, nullsFirst: false })
    .order("entry_name", { ascending: true });

  const entries = (entriesData ?? []) as unknown as EntryRow[];
  const entryIds = entries.map((e) => e.id);

  const memberMap = new Map<string, TeamMemberRow[]>();

  if (entryIds.length > 0) {
    const { data: teamMembersData } = await supabase
      .from("team_members")
      .select("id, entry_id, name, affiliation, member_order")
      .in("entry_id", entryIds)
      .order("member_order", { ascending: true });

    const teamMembers = (teamMembersData ?? []) as unknown as TeamMemberRow[];

    for (const member of teamMembers) {
      if (!memberMap.has(member.entry_id)) {
        memberMap.set(member.entry_id, []);
      }
      memberMap.get(member.entry_id)!.push(member);
    }
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1200px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目管理へ戻る
        </Link>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>団体戦 受付・メンバー確認</h1>
        <p style={{ margin: 0, color: "#555" }}>
          大会: {tournament?.name ?? "-"} / 種目: {division.name}
        </p>
        <p style={{ marginTop: "6px", color: "#666" }}>
          団体戦形式: {division.team_match_format ?? "-"}
          {division.team_member_required ? " / メンバー登録必須" : " / メンバー登録任意"}
          {division.team_member_count_min !== null
            ? ` / 最低 ${division.team_member_count_min} 名`
            : ""}
          {division.team_member_count_max !== null
            ? ` / 最大 ${division.team_member_count_max} 名`
            : ""}
        </p>
      </div>

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
          チーム受付一覧
        </div>

        {entries.length > 0 ? (
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
                  <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #eee" }}>
                    チーム名
                  </th>
                  <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #eee" }}>
                    所属
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    シード
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    メンバー数
                  </th>
                  <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #eee" }}>
                    メンバー一覧
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    メンバー確認
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    受付状態
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => {
                  const teamMembers = memberMap.get(entry.id) ?? [];
                  const checkin = entry.checkins?.[0] ?? null;

                  const memberCount = teamMembers.length;
                  const memberShortage =
                    Boolean(division.team_member_required) &&
                    division.team_member_count_min !== null &&
                    memberCount < division.team_member_count_min;

                  return (
                    <tr key={entry.id}>
                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{entry.entry_name ?? "-"}</div>
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.entry_affiliation ?? "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          textAlign: "center",
                        }}
                      >
                        {entry.ranking_for_draw ?? "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          textAlign: "center",
                        }}
                      >
                        <div>{memberCount}</div>
                        {memberShortage && (
                          <div style={{ color: "crimson", fontSize: "12px", marginTop: "4px" }}>
                            人数不足
                          </div>
                        )}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          minWidth: "240px",
                        }}
                      >
                        {teamMembers.length > 0 ? (
                          <div style={{ display: "grid", gap: "4px" }}>
                            {teamMembers.map((member, index) => (
                              <div key={member.id} style={{ fontSize: "13px" }}>
                                {index + 1}. {member.name}
                                {member.affiliation ? `（${member.affiliation}）` : ""}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#666" }}>未登録</span>
                        )}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            color: checkin?.member_confirmed ? "green" : "#666",
                            fontWeight: 600,
                          }}
                        >
                          {checkin?.member_confirmed ? "確認済" : "未確認"}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            color: getCheckinColor(checkin?.status),
                            fontWeight: 600,
                          }}
                        >
                          {getCheckinLabel(checkin?.status)}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          textAlign: "center",
                          minWidth: "300px",
                        }}
                      >
                        <form
                          action="/api/team-checkins/update"
                          method="post"
                          style={{ display: "grid", gap: "8px" }}
                        >
                          <input type="hidden" name="tournamentId" value={tournamentId} />
                          <input type="hidden" name="divisionId" value={divisionId} />
                          <input type="hidden" name="entryId" value={entry.id} />

                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                            <button
                              type="submit"
                              name="actionType"
                              value="checkin"
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              受付済にする
                            </button>

                            <button
                              type="submit"
                              name="actionType"
                              value="uncheck"
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              未受付に戻す
                            </button>

                            <button
                              type="submit"
                              name="actionType"
                              value="withdraw"
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              棄権にする
                            </button>
                          </div>

                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                            <button
                              type="submit"
                              name="actionType"
                              value="confirm_members"
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              メンバー確認済にする
                            </button>

                            <button
                              type="submit"
                              name="actionType"
                              value="unconfirm_members"
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              メンバー未確認に戻す
                            </button>

                            <Link
                              href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/team/${entry.id}/edit`}
                              style={{
                                display: "inline-block",
                                padding: "8px 12px",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "white",
                                color: "inherit",
                                textDecoration: "none",
                              }}
                            >
                              メンバー編集
                            </Link>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "16px", color: "#666" }}>
            まだ団体戦エントリーがありません。
          </div>
        )}
      </section>
    </main>
  );
}
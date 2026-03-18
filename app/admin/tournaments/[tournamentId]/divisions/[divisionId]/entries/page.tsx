import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function DivisionEntriesPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

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
      team_member_required,
      team_member_count_min,
      team_member_count_max
    `)
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}`}>← 大会管理へ戻る</Link>
        </div>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  if (division.event_type === "team") {
    const { data: entries } = await supabase
      .from("entries")
      .select(`
        id,
        entry_name,
        entry_affiliation,
        ranking_for_draw,
        affiliation_order,
        status
      `)
      .eq("division_id", divisionId)
      .order("ranking_for_draw", { ascending: true, nullsFirst: false })
      .order("affiliation_order", { ascending: true, nullsFirst: false })
      .order("entry_name", { ascending: true });

    const entryIds = (entries ?? []).map((e) => e.id);

    const memberCountMap = new Map<string, number>();
    if (entryIds.length > 0) {
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("id, entry_id")
        .in("entry_id", entryIds);

      for (const member of teamMembers ?? []) {
        memberCountMap.set(
          member.entry_id,
          (memberCountMap.get(member.entry_id) ?? 0) + 1
        );
      }
    }

    return (
      <main style={{ padding: "24px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ marginBottom: "8px" }}>団体戦エントリー一覧</h1>
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

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/team/new`}
            style={{
              display: "inline-block",
              padding: "10px 14px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            ＋ 団体戦エントリーを手動登録
          </Link>

          <Link
            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/import`}
            style={{
              display: "inline-block",
              padding: "10px 14px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            CSV取込へ
          </Link>
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
            チーム一覧
          </div>

          {entries && entries.length > 0 ? (
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
                    <th
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      チーム名
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      所属
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      シード
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      申込順位
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      メンバー数
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      状態
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const memberCount = memberCountMap.get(entry.id) ?? 0;
                    const memberWarning =
                      division.team_member_required &&
                      division.team_member_count_min !== null &&
                      memberCount < division.team_member_count_min;

                    return (
                      <tr key={entry.id}>
                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            verticalAlign: "top",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {entry.entry_name ?? "-"}
                          </div>
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            verticalAlign: "top",
                          }}
                        >
                          {entry.entry_affiliation ?? "-"}
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            textAlign: "center",
                            verticalAlign: "top",
                          }}
                        >
                          {entry.ranking_for_draw ?? "-"}
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            textAlign: "center",
                            verticalAlign: "top",
                          }}
                        >
                          {entry.affiliation_order ?? "-"}
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            textAlign: "center",
                            verticalAlign: "top",
                          }}
                        >
                          <div>{memberCount}</div>
                          {memberWarning && (
                            <div style={{ color: "crimson", fontSize: "12px", marginTop: "4px" }}>
                              不足
                            </div>
                          )}
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            textAlign: "center",
                            verticalAlign: "top",
                          }}
                        >
                          {entry.status ?? "-"}
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #f0f0f0",
                            textAlign: "center",
                            verticalAlign: "top",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Link
                            href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/team/${entry.id}/edit`}
                            style={{
                              display: "inline-block",
                              padding: "8px 12px",
                              border: "1px solid #ccc",
                              borderRadius: "8px",
                              textDecoration: "none",
                              color: "inherit",
                              background: "white",
                            }}
                          >
                            編集
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "16px", color: "#666" }}>
              まだ団体戦エントリーは登録されていません。
            </div>
          )}
        </section>
      </main>
    );
  }

  const { data: entries } = await supabase
    .from("entries")
    .select(`
      id,
      status,
      ranking_for_draw,
      affiliation_order,
      players (
        id,
        name,
        affiliation
      )
    `)
    .eq("division_id", divisionId)
    .order("ranking_for_draw", { ascending: true, nullsFirst: false })
    .order("affiliation_order", { ascending: true, nullsFirst: false });

  return (
    <main style={{ padding: "24px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目管理へ戻る
        </Link>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>個人戦エントリー一覧</h1>
        <p style={{ margin: 0, color: "#555" }}>
          大会: {tournament?.name ?? "-"} / 種目: {division.name}
        </p>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/new`}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            textDecoration: "none",
            color: "inherit",
            background: "white",
          }}
        >
          ＋ 個人エントリーを手動登録
        </Link>

        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries/import`}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            textDecoration: "none",
            color: "inherit",
            background: "white",
          }}
        >
          CSV取込へ
        </Link>
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
          個人一覧
        </div>

        {entries && entries.length > 0 ? (
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
                    名前
                  </th>
                  <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #eee" }}>
                    所属
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    シード
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    申込順位
                  </th>
                  <th style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #eee" }}>
                    状態
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0" }}>
                      {entry.players?.name ?? "-"}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0" }}>
                      {entry.players?.affiliation ?? "-"}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {entry.ranking_for_draw ?? "-"}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {entry.affiliation_order ?? "-"}
                    </td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {entry.status ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "16px", color: "#666" }}>
            まだ個人エントリーは登録されていません。
          </div>
        )}
      </section>
    </main>
  );
}
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
  team_members: string[] | null;
  checkins:
    | Array<{
        id: string;
        status: string | null;
      }>
    | null;
};

function getCheckinStatus(entry: EntryRow) {
  const checkin = Array.isArray(entry.checkins) ? entry.checkins[0] : null;
  return checkin?.status ?? null;
}

function isCheckedIn(entry: EntryRow) {
  return getCheckinStatus(entry) === "checked_in";
}

function buildEntryLabel(entry: EntryRow) {
  const base =
    entry.entry_name && entry.entry_name.trim() !== ""
      ? entry.entry_name
      : "名称未設定";

  return `${base}${isCheckedIn(entry) ? "（受付済み）" : ""}`;
}

function buildMembersLabel(entry: EntryRow) {
  if (!Array.isArray(entry.team_members) || entry.team_members.length === 0) {
    return "";
  }
  return entry.team_members.join(" / ");
}

export default async function DivisionCheckinPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format, event_type")
    .eq("id", divisionId)
    .single();

  const { data: entriesData, error: entriesError } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      status,
      team_members,
      checkins (
        id,
        status
      )
    `)
    .eq("division_id", divisionId)
    .order("entry_name", { ascending: true });

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

  const entries = (entriesData ?? []) as EntryRow[];

  return (
    <main style={{ padding: "24px", maxWidth: "1000px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
          ← 種目管理へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>参加者受付</h1>

      <div style={{ marginBottom: "20px", color: "#555", lineHeight: 1.7 }}>
        <div>大会: {tournament?.name ?? "-"}</div>
        <div>種目: {division?.name ?? "-"}</div>
        <div>形式: {division?.format ?? "-"}</div>
      </div>

      {entries.length === 0 ? (
        <p>参加者がいません。</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          {entries.map((entry) => {
            const checkedIn = isCheckedIn(entry);
            const label = buildEntryLabel(entry);
            const membersLabel = buildMembersLabel(entry);

            return (
              <form
                key={entry.id}
                action="/api/checkins/update"
                method="post"
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "14px",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <input type="hidden" name="tournamentId" value={tournamentId} />
                <input type="hidden" name="divisionId" value={divisionId} />
                <input type="hidden" name="entryId" value={entry.id} />
                <input
                  type="hidden"
                  name="nextStatus"
                  value={checkedIn ? "waiting" : "checked_in"}
                />

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "16px",
                      marginBottom: "4px",
                      wordBreak: "break-word",
                    }}
                  >
                    {label}
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "#666",
                      wordBreak: "break-word",
                      marginBottom: membersLabel ? "4px" : 0,
                    }}
                  >
                    {entry.entry_affiliation ?? ""}
                  </div>

                  {membersLabel ? (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#777",
                        wordBreak: "break-word",
                        lineHeight: 1.5,
                      }}
                    >
                      選手: {membersLabel}
                    </div>
                  ) : null}
                </div>

                <button
                  type="submit"
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: checkedIn ? "#f5f5f5" : "white",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {checkedIn ? "受付取消" : "受付する"}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </main>
  );
}
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicTeamCheckinClient from "@/components/PublicTeamCheckinClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    divisionId: string;
    token: string;
  }>;
};

export default async function PublicCheckinTokenPage({ params }: PageProps) {
  const { tournamentId, divisionId, token } = await params;
  const supabase = createSupabaseServerClient();

  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select(
      "id, name, event_type, member_registration_required, public_access_token"
    )
    .eq("id", divisionId)
    .single();

  if (divisionError || !division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目情報を取得できませんでした。</p>
        <p>{divisionError?.message ?? "division not found"}</p>
      </main>
    );
  }

  if (!division.public_access_token) {
    return (
      <main style={{ padding: "24px" }}>
        <p>この種目にはまだ公開トークンが設定されていません。</p>
        <p>管理画面で「公開トークンを再発行」してください。</p>
      </main>
    );
  }

  if (division.public_access_token !== token) {
    return (
      <main style={{ padding: "24px" }}>
        <p>この受付ページにはアクセスできません。</p>
        <p>URLが古い可能性があります。管理者から最新URLを受け取ってください。</p>
      </main>
    );
  }

  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select(
      `
      id,
      entry_name,
      status,
      team_members,
      checkins (
        id,
        status
      )
    `
    )
    .eq("division_id", divisionId)
    .order("entry_name", { ascending: true });

  if (entriesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>エントリー情報を取得できませんでした。</p>
        <p>{entriesError.message}</p>
      </main>
    );
  }

  const typedEntries =
    (entries as Array<{
      id: string;
      entry_name: string | null;
      status: string | null;
      team_members: string[] | null;
      checkins:
        | { id: string; status: string | null }[]
        | { id: string; status: string | null }
        | null;
    }> | null) ?? [];

  const teams = typedEntries.map((entry) => ({
    entryId: entry.id,
    teamName: entry.entry_name ?? "-",
    memberRequired: Boolean(division.member_registration_required),
    members: Array.isArray(entry.team_members) ? entry.team_members : [],
    status: entry.status ?? null,
    checkinStatus: Array.isArray(entry.checkins)
      ? entry.checkins[0]?.status ?? null
      : entry.checkins?.status ?? null,
  }));

  return (
    <PublicTeamCheckinClient
      tournamentId={tournamentId}
      divisionId={divisionId}
      divisionName={division.name ?? "-"}
      teams={teams}
    />
  );
}
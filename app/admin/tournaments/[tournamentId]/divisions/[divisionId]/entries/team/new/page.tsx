import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamEntryFormClient from "@/components/TeamEntryFormClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function NewTeamEntryPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: division } = await supabase
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

  if (!division || division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}>
            ← エントリー一覧へ戻る
          </Link>
        </div>
        <p>この種目は団体戦ではありません。</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px", maxWidth: "980px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}>
          ← エントリー一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦エントリー登録</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "24px" }}>
        種目: {division.name} / 形式: {division.team_match_format ?? "-"}
      </p>

      <TeamEntryFormClient
        tournamentId={tournamentId}
        divisionId={divisionId}
        defaultTeamName=""
        defaultTeamAffiliation=""
        defaultSeed=""
        defaultApplicationRank=""
        defaultMembers={[]}
        teamMemberRequired={division.team_member_required ?? false}
        teamMemberCountMin={division.team_member_count_min}
        teamMemberCountMax={division.team_member_count_max}
        submitUrl="/api/team-entries/create"
        submitLabel="登録する"
      />
    </main>
  );
}
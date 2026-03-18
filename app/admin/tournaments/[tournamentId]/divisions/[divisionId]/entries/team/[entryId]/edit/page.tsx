import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TeamEntryFormClient from "@/components/TeamEntryFormClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string; entryId: string }>;
};

export default async function EditTeamEntryPage({ params }: PageProps) {
  const { tournamentId, divisionId, entryId } = await params;
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

  const { data: entry } = await supabase
    .from("entries")
    .select(`
      id,
      entry_name,
      entry_affiliation,
      ranking_for_draw,
      affiliation_order
    `)
    .eq("id", entryId)
    .eq("division_id", divisionId)
    .single();

  const { data: teamMembers } = await supabase
    .from("team_members")
    .select(`
      id,
      name,
      affiliation,
      seed,
      application_rank,
      member_order
    `)
    .eq("entry_id", entryId)
    .order("member_order", { ascending: true });

  if (!entry) {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}>
            ← エントリー一覧へ戻る
          </Link>
        </div>
        <p>エントリーが見つかりませんでした。</p>
      </main>
    );
  }

  const defaultMembers = Array.from({ length: 8 }, (_, index) => {
    const member = (teamMembers ?? [])[index];
    return {
      name: member?.name ?? "",
      affiliation: member?.affiliation ?? "",
      seed: member?.seed?.toString?.() ?? "",
      applicationRank: member?.application_rank?.toString?.() ?? "",
    };
  });

  return (
    <main style={{ padding: "24px", maxWidth: "980px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/entries`}>
          ← エントリー一覧へ戻る
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>団体戦エントリー編集</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "24px" }}>
        種目: {division.name} / 形式: {division.team_match_format ?? "-"}
      </p>

      <TeamEntryFormClient
        divisionId={divisionId}
        entryId={entryId}
        defaultTeamName={entry.entry_name ?? ""}
        defaultTeamAffiliation={entry.entry_affiliation ?? ""}
        defaultSeed={entry.ranking_for_draw?.toString?.() ?? ""}
        defaultApplicationRank={entry.affiliation_order?.toString?.() ?? ""}
        defaultMembers={defaultMembers}
        teamMemberRequired={division.team_member_required ?? false}
        teamMemberCountMin={division.team_member_count_min}
        teamMemberCountMax={division.team_member_count_max}
        submitUrl="/api/team-entries/update"
        submitLabel="更新する"
      />
    </main>
  );
}
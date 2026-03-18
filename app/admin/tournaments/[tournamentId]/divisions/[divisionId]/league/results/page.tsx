import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LeagueResultsClient from "./LeagueResultsClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function DivisionLeagueResultsPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, format")
    .eq("id", divisionId)
    .single();

  if (!tournament || !division) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>リーグ結果入力</h1>
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

  const { data: groupsData } = await supabase
    .from("league_groups")
    .select("id, group_no, name, table_numbers, results_confirmed, results_confirmed_at, rating_applied")
    .eq("division_id", divisionId)
    .order("group_no", { ascending: true });

  const groups = groupsData ?? [];
  const groupIds = groups.map((group: any) => group.id);

  let membersData: any[] = [];
  let matchesData: any[] = [];

  if (groupIds.length > 0) {
    const { data: fetchedMembers } = await supabase
      .from("league_group_members")
      .select("id, group_id, entry_id, slot_no")
      .in("group_id", groupIds)
      .order("slot_no", { ascending: true });

    const { data: fetchedMatches } = await supabase
      .from("league_matches")
      .select(`
        id,
        group_id,
        round_no,
        slot_no,
        match_no,
        table_no,
        player1_entry_id,
        player2_entry_id,
        referee_entry_id,
        winner_entry_id,
        score_text,
        game_scores,
        status
      `)
      .in("group_id", groupIds)
      .order("round_no", { ascending: true })
      .order("slot_no", { ascending: true })
      .order("match_no", { ascending: true });

    membersData = fetchedMembers ?? [];
    matchesData = fetchedMatches ?? [];
  }

  return (
    <main style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/league`}>
          ← リーグ管理へ戻る
        </Link>
      </div>

      <LeagueResultsClient
        tournamentId={tournamentId}
        divisionId={divisionId}
        tournamentName={tournament.name}
        divisionName={division.name}
        entries={entriesData ?? []}
        groups={groups}
        members={membersData}
        matches={matchesData}
      />
    </main>
  );
}
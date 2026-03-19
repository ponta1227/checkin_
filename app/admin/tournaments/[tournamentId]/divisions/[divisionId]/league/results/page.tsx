import LeagueResultsClient from "./LeagueResultsClient";
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
  players: {
    id: string;
    name: string | null;
    affiliation: string | null;
  } | null;
};

export default async function Page({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const [
    tournamentRes,
    divisionRes,
    entriesRes,
    groupsRes,
    membersRes,
    matchesRes,
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name")
      .eq("id", tournamentId)
      .single(),

    supabase
      .from("divisions")
      .select("id, name")
      .eq("id", divisionId)
      .single(),

    supabase
      .from("entries")
      .select(`
        id,
        players (
          id,
          name,
          affiliation
        )
      `)
      .eq("division_id", divisionId),

    supabase
      .from("league_groups")
      .select("*")
      .eq("division_id", divisionId)
      .order("group_no", { ascending: true }),

    supabase
      .from("league_group_members")
      .select("*")
      .eq("division_id", divisionId)
      .order("group_id", { ascending: true })
      .order("slot_no", { ascending: true }),

    supabase
      .from("matches")
      .select("*")
      .eq("division_id", divisionId)
      .eq("stage", "league")
      .order("group_id", { ascending: true })
      .order("match_no", { ascending: true }),
  ]);

  if (tournamentRes.error) {
    throw new Error(tournamentRes.error.message);
  }
  if (divisionRes.error) {
    throw new Error(divisionRes.error.message);
  }
  if (entriesRes.error) {
    throw new Error(entriesRes.error.message);
  }
  if (groupsRes.error) {
    throw new Error(groupsRes.error.message);
  }
  if (membersRes.error) {
    throw new Error(membersRes.error.message);
  }
  if (matchesRes.error) {
    throw new Error(matchesRes.error.message);
  }

  const tournament = tournamentRes.data;
  const division = divisionRes.data;

  const entriesData = (entriesRes.data ?? []) as Array<{
    id: string;
    players:
      | Array<{
          id: string;
          name: string | null;
          affiliation: string | null;
        }>
      | null;
  }>;

  const normalizedEntries: EntryRow[] = entriesData.map((entry) => ({
    id: entry.id,
    players: Array.isArray(entry.players) ? (entry.players[0] ?? null) : null,
  }));

  const groups = groupsRes.data ?? [];
  const membersData = membersRes.data ?? [];
  const matchesData = matchesRes.data ?? [];

  return (
    <LeagueResultsClient
      tournamentId={tournamentId}
      divisionId={divisionId}
      tournamentName={tournament.name}
      divisionName={division.name}
      entries={normalizedEntries}
      groups={groups}
      members={membersData}
      matches={matchesData}
    />
  );
}
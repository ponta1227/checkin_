import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDivisionManagePath } from "@/lib/divisions/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function DivisionManageRouterPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, format")
    .eq("id", divisionId)
    .single();

  if (!division) {
    redirect(`/admin/tournaments/${tournamentId}/divisions`);
  }

  redirect(getDivisionManagePath(division.format, tournamentId, divisionId));
}
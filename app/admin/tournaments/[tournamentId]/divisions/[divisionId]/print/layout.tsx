import type { ReactNode } from "react";
import PrintPdfFrame from "@/components/PrintPdfFrame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = {
  children: ReactNode;
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

export default async function PrintLayout({ children, params }: Props) {
  const { tournamentId, divisionId } = await params;
  const supabase = createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .single();

  const { data: division } = await supabase
    .from("divisions")
    .select("name")
    .eq("id", divisionId)
    .single();

  return (
    <PrintPdfFrame
      tournamentName={tournament?.name ?? "大会"}
      divisionName={division?.name ?? "種目"}
    >
      {children}
    </PrintPdfFrame>
  );
}
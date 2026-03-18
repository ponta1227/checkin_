export type DivisionFlowType = "tournament" | "league" | "league_then_knockout";

export function normalizeDivisionFormat(format: string | null | undefined): DivisionFlowType {
  const value = (format ?? "").trim().toLowerCase();

  if (
    value === "league" ||
    value === "round_robin"
  ) {
    return "league";
  }

  if (
    value === "league_then_knockout" ||
    value === "league_to_tournament" ||
    value === "league_knockout" ||
    value === "round_robin_then_knockout"
  ) {
    return "league_then_knockout";
  }

  return "tournament";
}

export function getDivisionFormatLabel(format: string | null | undefined) {
  const normalized = normalizeDivisionFormat(format);

  if (normalized === "league_then_knockout") return "リーグ→トーナメント";
  if (normalized === "league") return "リーグ";
  return "トーナメント";
}

export function getDivisionManagePath(
  format: string | null | undefined,
  tournamentId: string,
  divisionId: string
) {
  const normalized = normalizeDivisionFormat(format);

  if (normalized === "league" || normalized === "league_then_knockout") {
    return `/admin/tournaments/${tournamentId}/divisions/${divisionId}/league`;
  }

  return `/admin/tournaments/${tournamentId}/divisions/${divisionId}/bracket`;
}

export function getDivisionManageLabel(format: string | null | undefined) {
  const normalized = normalizeDivisionFormat(format);

  if (normalized === "league_then_knockout") return "リーグ→トーナメント管理へ";
  if (normalized === "league") return "リーグ管理へ";
  return "トーナメント管理へ";
}
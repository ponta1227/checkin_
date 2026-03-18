export function formatLeagueSourceLabel(params: {
  sourceType: string | null | undefined;
  groupNo: number | null | undefined;
  rank: number | null | undefined;
}) {
  const { sourceType, groupNo, rank } = params;

  if (sourceType !== "league_rank") return "未定";
  if (!groupNo || !rank) return "未定";

  return `${groupNo}リーグ${rank}位`;
}
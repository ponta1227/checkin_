import type { CSSProperties } from "react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLeagueSourceLabel } from "@/lib/team/displaySources";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string; divisionId: string }>;
};

type MatchRow = {
  id: string;
  round_no: number | null;
  match_no: number | null;
  status: string | null;
  score_text: string | null;
  player1_entry_id: string | null;
  player2_entry_id: string | null;
  winner_entry_id: string | null;
  bracket_id: string | null;
  league_group_no: number | null;
  player1_source_type: string | null;
  player1_source_group_no: number | null;
  player1_source_rank: number | null;
  player2_source_type: string | null;
  player2_source_group_no: number | null;
  player2_source_rank: number | null;
};

type DisplayMatch = {
  matchId: string;
  bracketLabel: string;
  roundNo: number;
  matchNo: number;
  team1Name: string;
  team2Name: string;
  status: string | null;
  scoreText: string | null;
};

const CARD_WIDTH = 220;
const CARD_HEIGHT = 132;
const BASE_GAP = 28;
const COLUMN_GAP = 56;

function getBracketLabel(bracketType: string) {
  if (bracketType === "main") return "本戦";
  if (bracketType === "upper") return "上位トーナメント";
  if (bracketType === "lower") return "下位トーナメント";
  if (/^rank_\d+$/.test(bracketType)) {
    return `${bracketType.replace("rank_", "")}位トーナメント`;
  }
  return bracketType || "-";
}

function getStatusText(
  status: string | null | undefined,
  scoreText: string | null | undefined
) {
  if (status === "completed") return scoreText ?? "完了";
  if (status === "in_progress") return "試合中";
  if (status === "ready") return "入力可能";
  if (status === "pending") return "未入力";
  return scoreText ?? "-";
}

function resolveDisplayName(params: {
  entryId: string | null | undefined;
  entryMap: Map<
    string,
    {
      id: string;
      entry_name: string | null;
      entry_affiliation: string | null;
    }
  >;
  sourceType: string | null | undefined;
  sourceGroupNo: number | null | undefined;
  sourceRank: number | null | undefined;
}) {
  const { entryId, entryMap, sourceType, sourceGroupNo, sourceRank } = params;

  if (entryId) {
    return entryMap.get(String(entryId))?.entry_name ?? "未定";
  }

  return formatLeagueSourceLabel({
    sourceType,
    groupNo: sourceGroupNo,
    rank: sourceRank,
  });
}

function groupKnockoutMatches(matches: DisplayMatch[]) {
  const byBracket = new Map<string, DisplayMatch[]>();

  for (const match of matches) {
    if (!byBracket.has(match.bracketLabel)) {
      byBracket.set(match.bracketLabel, []);
    }
    byBracket.get(match.bracketLabel)!.push(match);
  }

  return Array.from(byBracket.entries()).map(([bracketLabel, bucket]) => {
    const roundMap = new Map<number, DisplayMatch[]>();

    for (const match of bucket) {
      if (!roundMap.has(match.roundNo)) {
        roundMap.set(match.roundNo, []);
      }
      roundMap.get(match.roundNo)!.push(match);
    }

    const rounds = Array.from(roundMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([roundNo, roundMatches]) => ({
        roundNo,
        matches: [...roundMatches].sort((a, b) => a.matchNo - b.matchNo),
      }));

    return {
      bracketLabel,
      rounds,
    };
  });
}

function getRoundTopOffset(roundIndex: number) {
  if (roundIndex === 0) return 0;
  return ((CARD_HEIGHT + BASE_GAP) * (2 ** roundIndex - 1)) / 2;
}

function getRoundGap(roundIndex: number) {
  return (CARD_HEIGHT + BASE_GAP) * 2 ** roundIndex - CARD_HEIGHT;
}

export default async function TeamBracketPage({ params }: PageProps) {
  const { tournamentId, divisionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("id, name, event_type, format")
    .eq("id", divisionId)
    .single();

  if (!division) {
    return (
      <main style={{ padding: "24px" }}>
        <p>種目が見つかりませんでした。</p>
      </main>
    );
  }

  if (division.event_type !== "team") {
    return (
      <main style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}>
            ← 種目管理へ戻る
          </Link>
        </div>
        <p>このページは団体戦専用です。</p>
      </main>
    );
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, bracket_type")
    .eq("division_id", divisionId);

  const bracketTypeMap = new Map<string, string>();
  for (const bracket of brackets ?? []) {
    bracketTypeMap.set(String(bracket.id), String(bracket.bracket_type ?? ""));
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(`
      id,
      round_no,
      match_no,
      status,
      score_text,
      player1_entry_id,
      player2_entry_id,
      winner_entry_id,
      bracket_id,
      league_group_no,
      player1_source_type,
      player1_source_group_no,
      player1_source_rank,
      player2_source_type,
      player2_source_group_no,
      player2_source_rank
    `)
    .eq("division_id", divisionId)
    .not("bracket_id", "is", null)
    .neq("status", "skipped")
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });

  if (matchesError) {
    return (
      <main style={{ padding: "24px" }}>
        <p>トーナメント試合の取得に失敗しました。</p>
        <p>{matchesError.message}</p>
      </main>
    );
  }

  const typedMatches = (matches ?? []) as MatchRow[];

  const entryIds = Array.from(
    new Set(
      typedMatches
        .flatMap((m) => [m.player1_entry_id, m.player2_entry_id, m.winner_entry_id])
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: matchEntries } =
    entryIds.length > 0
      ? await supabase
          .from("entries")
          .select("id, entry_name, entry_affiliation")
          .in("id", entryIds)
      : {
          data: [] as Array<{
            id: string;
            entry_name: string | null;
            entry_affiliation: string | null;
          }>,
        };

  const entryMap = new Map((matchEntries ?? []).map((e) => [String(e.id), e] as const));

  const displayMatches: DisplayMatch[] = typedMatches.map((match) => {
    const bracketType = match.bracket_id
      ? bracketTypeMap.get(String(match.bracket_id)) ?? "main"
      : "main";

    return {
      matchId: match.id,
      bracketLabel: getBracketLabel(bracketType),
      roundNo: match.round_no ?? 0,
      matchNo: match.match_no ?? 0,
      team1Name: resolveDisplayName({
        entryId: match.player1_entry_id,
        entryMap,
        sourceType: match.player1_source_type,
        sourceGroupNo: match.player1_source_group_no,
        sourceRank: match.player1_source_rank,
      }),
      team2Name: resolveDisplayName({
        entryId: match.player2_entry_id,
        entryMap,
        sourceType: match.player2_source_type,
        sourceGroupNo: match.player2_source_group_no,
        sourceRank: match.player2_source_rank,
      }),
      status: match.status,
      scoreText: match.score_text,
    };
  });

  const groupedBrackets = groupKnockoutMatches(displayMatches);

  return (
    <main style={{ padding: "24px", maxWidth: "1600px" }}>
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
          style={topLinkStyle()}
        >
          種目管理へ
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
          style={topLinkStyle()}
        >
          試合一覧へ
        </Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>トーナメント表</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {division.name}
      </p>

      {groupedBrackets.length === 0 ? (
        <p>トーナメントがありません。</p>
      ) : (
        <div style={{ display: "grid", gap: "20px" }}>
          {groupedBrackets.map((bracket) => (
            <BracketSection
              key={bracket.bracketLabel}
              bracketLabel={bracket.bracketLabel}
              rounds={bracket.rounds}
              tournamentId={tournamentId}
              divisionId={divisionId}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function BracketSection({
  bracketLabel,
  rounds,
  tournamentId,
  divisionId,
}: {
  bracketLabel: string;
  rounds: Array<{
    roundNo: number;
    matches: DisplayMatch[];
  }>;
  tournamentId: string;
  divisionId: string;
}) {
  const columnHeights = rounds.map((_, roundIndex) => {
    const topOffset = getRoundTopOffset(roundIndex);
    const gap = getRoundGap(roundIndex);
    const count = rounds[roundIndex].matches.length;
    if (count === 0) return topOffset + CARD_HEIGHT;
    return topOffset + count * CARD_HEIGHT + (count - 1) * gap;
  });

  const maxHeight = Math.max(...columnHeights, CARD_HEIGHT + 20);

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: "10px",
        background: "white",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee", fontWeight: 700 }}>
        {bracketLabel}
      </div>

      <div style={{ overflowX: "auto", padding: "20px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: `${COLUMN_GAP}px`,
            minWidth: `${Math.max(1, rounds.length) * (CARD_WIDTH + COLUMN_GAP)}px`,
          }}
        >
          {rounds.map((round, roundIndex) => (
            <RoundColumn
              key={`${bracketLabel}-${round.roundNo}`}
              roundNo={round.roundNo}
              matches={round.matches}
              roundIndex={roundIndex}
              columnHeight={maxHeight}
              tournamentId={tournamentId}
              divisionId={divisionId}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoundColumn({
  roundNo,
  matches,
  roundIndex,
  columnHeight,
  tournamentId,
  divisionId,
}: {
  roundNo: number;
  matches: DisplayMatch[];
  roundIndex: number;
  columnHeight: number;
  tournamentId: string;
  divisionId: string;
}) {
  const topOffset = getRoundTopOffset(roundIndex);
  const gap = getRoundGap(roundIndex);

  return (
    <div style={{ position: "relative", width: `${CARD_WIDTH}px`, height: `${columnHeight}px` }}>
      <div style={{ fontWeight: 700, marginBottom: "14px" }}>{roundNo}回戦</div>

      <div
        style={{
          position: "relative",
          marginTop: "8px",
          height: `${columnHeight - 30}px`,
        }}
      >
        {matches.map((match, matchIndex) => {
          const top = topOffset + matchIndex * (CARD_HEIGHT + gap);

          return (
            <div
              key={match.matchId}
              style={{
                position: "absolute",
                top: `${top}px`,
                left: 0,
              }}
            >
              <BracketMatchCard
                match={match}
                roundIndex={roundIndex}
                matchIndex={matchIndex}
                totalMatches={matches.length}
                tournamentId={tournamentId}
                divisionId={divisionId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  roundIndex,
  matchIndex,
  totalMatches,
  tournamentId,
  divisionId,
}: {
  match: DisplayMatch;
  roundIndex: number;
  matchIndex: number;
  totalMatches: number;
  tournamentId: string;
  divisionId: string;
}) {
  const connectorSpan = (CARD_HEIGHT + BASE_GAP) * 2 ** roundIndex;
  const halfSpan = connectorSpan / 2;
  const pairTop = matchIndex % 2 === 0;
  const hasPair = pairTop ? matchIndex + 1 < totalMatches : true;

  return (
    <div style={{ position: "relative", width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px` }}>
      {hasPair ? (
        <>
          <div
            style={{
              position: "absolute",
              right: `-${COLUMN_GAP / 2}px`,
              top: "50%",
              width: `${COLUMN_GAP / 2}px`,
              borderTop: "2px solid #444",
              transform: "translateY(-50%)",
            }}
          />

          {pairTop ? (
            <div
              style={{
                position: "absolute",
                right: `-${COLUMN_GAP / 2}px`,
                top: "50%",
                width: `${COLUMN_GAP / 2}px`,
                height: `${halfSpan}px`,
                borderRight: "2px solid #444",
                borderBottom: "2px solid #444",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                right: `-${COLUMN_GAP / 2}px`,
                top: `calc(50% - ${halfSpan}px)`,
                width: `${COLUMN_GAP / 2}px`,
                height: `${halfSpan}px`,
                borderRight: "2px solid #444",
                borderTop: "2px solid #444",
              }}
            />
          )}
        </>
      ) : null}

      <Link
        href={`/admin/tournaments/${tournamentId}/divisions/${divisionId}/matches`}
        style={{
          display: "block",
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
          border: "1px solid #444",
          borderRadius: "10px",
          background: "white",
          textDecoration: "none",
          color: "inherit",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #ddd",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          第{match.matchNo}試合
        </div>

        <div
          style={{
            minHeight: "38px",
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            lineHeight: 1.25,
            display: "flex",
            alignItems: "center",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {match.team1Name}
        </div>

        <div
          style={{
            minHeight: "38px",
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            lineHeight: 1.25,
            display: "flex",
            alignItems: "center",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {match.team2Name}
        </div>

        <div
          style={{
            minHeight: "32px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#555",
            display: "flex",
            alignItems: "center",
          }}
        >
          {getStatusText(match.status, match.scoreText)}
        </div>
      </Link>
    </div>
  );
}

function topLinkStyle(): CSSProperties {
  return {
    display: "inline-block",
    padding: "10px 14px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    color: "inherit",
    textDecoration: "none",
  };
}
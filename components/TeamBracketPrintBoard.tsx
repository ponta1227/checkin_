type BracketMatch = {
  matchId: string;
  bracketType: string;
  bracketLabel: string;
  roundNo: number;
  matchNo: number;
  team1Name: string;
  team2Name: string;
  scoreText: string | null;
  tableNo: number | null;
};

type Props = {
  tournamentName: string;
  divisionName: string;
  teamMatchFormat: string | null;
  matches: BracketMatch[];
};

type RoundData = {
  roundNo: number;
  matches: BracketMatch[];
};

const CARD_WIDTH = 190;
const CARD_HEIGHT = 92;
const ROUND_GAP = 48;
const BASE_VERTICAL_GAP = 18;
const ROUND_TITLE_HEIGHT = 26;
const CONNECTOR_GAP = 16;

function buildRounds(matches: BracketMatch[]): RoundData[] {
  const map = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    if (!map.has(match.roundNo)) map.set(match.roundNo, []);
    map.get(match.roundNo)!.push(match);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([roundNo, rows]) => ({
      roundNo,
      matches: [...rows].sort((a, b) => a.matchNo - b.matchNo),
    }));
}

function groupByBracket(matches: BracketMatch[]) {
  const map = new Map<string, { label: string; matches: BracketMatch[] }>();
  for (const match of matches) {
    const key = match.bracketType || "main";
    if (!map.has(key)) {
      map.set(key, {
        label: match.bracketLabel,
        matches: [],
      });
    }
    map.get(key)!.matches.push(match);
  }
  return Array.from(map.entries());
}

function getRoundTop(roundIndex: number, matchIndex: number) {
  const block = CARD_HEIGHT + BASE_VERTICAL_GAP;
  return (
    matchIndex * block * Math.pow(2, roundIndex) +
    ((Math.pow(2, roundIndex) - 1) * block) / 2
  );
}

function getRoundHeight(rounds: RoundData[]) {
  if (rounds.length === 0) return CARD_HEIGHT + ROUND_TITLE_HEIGHT;

  let maxBottom = 0;
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((_, matchIndex) => {
      const top = getRoundTop(roundIndex, matchIndex);
      maxBottom = Math.max(maxBottom, top + CARD_HEIGHT);
    });
  });

  return maxBottom + ROUND_TITLE_HEIGHT + 6;
}

function PrintBracketGroup({
  groupLabel,
  groupMatches,
}: {
  groupLabel: string;
  groupMatches: BracketMatch[];
}) {
  const rounds = buildRounds(groupMatches);
  const boardHeight = getRoundHeight(rounds);

  return (
    <section className="team-print-group">
      <div className="team-print-group-title">{groupLabel}</div>

      <div className="team-print-board-wrap">
        <div
          className="team-print-board"
          style={{
            width: rounds.length * (CARD_WIDTH + ROUND_GAP) + 80,
            height: boardHeight,
          }}
        >
          {rounds.map((round, roundIndex) => {
            const left = roundIndex * (CARD_WIDTH + ROUND_GAP);

            return (
              <div
                key={round.roundNo}
                className="team-print-round"
                style={{
                  left,
                  width: CARD_WIDTH + CONNECTOR_GAP + ROUND_GAP,
                  height: boardHeight,
                }}
              >
                <div className="team-print-round-title">{round.roundNo}回戦</div>

                {round.matches.map((match, matchIndex) => {
                  const top = ROUND_TITLE_HEIGHT + getRoundTop(roundIndex, matchIndex);
                  const hasNextRound = roundIndex < rounds.length - 1;
                  const isTopOfPair = matchIndex % 2 === 0;
                  const pairExists = matchIndex + 1 < round.matches.length;

                  return (
                    <div key={match.matchId}>
                      <div
                        className="team-print-card-wrap"
                        style={{
                          top,
                          left: 0,
                          width: CARD_WIDTH,
                          height: CARD_HEIGHT,
                        }}
                      >
                        <div className="team-print-card">
                          <div className="team-print-card-head">
                            <span>第{match.matchNo}試合</span>
                            <span>台: {match.tableNo ?? "-"}</span>
                          </div>

                          <div className="team-print-teamline">
                            {match.team1Name || "未定"}
                          </div>
                          <div className="team-print-teamline">
                            {match.team2Name || "未定"}
                          </div>

                          <div className="team-print-score">
                            団体スコア: {match.scoreText ?? "-"}
                          </div>
                        </div>
                      </div>

                      {hasNextRound && (
                        <div
                          className="team-print-horizontal"
                          style={{
                            top: top + CARD_HEIGHT / 2,
                            left: CARD_WIDTH,
                            width: CONNECTOR_GAP,
                          }}
                        />
                      )}

                      {hasNextRound && isTopOfPair && pairExists && (
                        <>
                          <div
                            className="team-print-vertical"
                            style={{
                              left: CARD_WIDTH + CONNECTOR_GAP,
                              top: top + CARD_HEIGHT / 2,
                              height:
                                getRoundTop(roundIndex, matchIndex + 1) -
                                getRoundTop(roundIndex, matchIndex),
                            }}
                          />
                          <div
                            className="team-print-horizontal"
                            style={{
                              top:
                                ROUND_TITLE_HEIGHT +
                                getRoundTop(roundIndex + 1, Math.floor(matchIndex / 2)) +
                                CARD_HEIGHT / 2,
                              left: CARD_WIDTH + CONNECTOR_GAP,
                              width: ROUND_GAP - CONNECTOR_GAP,
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function TeamBracketPrintBoard({
  tournamentName,
  divisionName,
  teamMatchFormat,
  matches,
}: Props) {
  const groups = groupByBracket(matches);

  return (
    <main style={{ padding: "16px" }}>
      <style>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        .team-print-title {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .team-print-subtitle {
          font-size: 13px;
          color: #444;
          margin-bottom: 14px;
        }

        .team-print-group {
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
          margin-bottom: 20px;
          break-inside: avoid;
          overflow: hidden;
        }

        .team-print-group-title {
          font-size: 16px;
          font-weight: 700;
          padding: 10px 14px;
          border-bottom: 1px solid #eee;
          background: #fafafa;
        }

        .team-print-board-wrap {
          overflow: hidden;
          padding: 14px;
        }

        .team-print-board {
          position: relative;
          min-width: fit-content;
        }

        .team-print-round {
          position: absolute;
          top: 0;
        }

        .team-print-round-title {
          position: absolute;
          top: 0;
          left: 0;
          font-size: 12px;
          font-weight: 700;
        }

        .team-print-card-wrap {
          position: absolute;
        }

        .team-print-card {
          border: 1px solid #222;
          border-radius: 8px;
          background: #fff;
          overflow: hidden;
          width: ${CARD_WIDTH}px;
          height: ${CARD_HEIGHT}px;
        }

        .team-print-card-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          border-bottom: 1px solid #ddd;
          background: #f7f7f7;
          font-size: 10px;
          font-weight: 700;
        }

        .team-print-teamline {
          min-height: 22px;
          padding: 5px 8px;
          border-bottom: 1px solid #eee;
          font-size: 10px;
          display: flex;
          align-items: center;
        }

        .team-print-teamline:last-of-type {
          border-bottom: none;
        }

        .team-print-score {
          padding: 5px 8px;
          border-top: 1px solid #eee;
          font-size: 9px;
          color: #555;
        }

        .team-print-horizontal {
          position: absolute;
          border-top: 1px solid #222;
        }

        .team-print-vertical {
          position: absolute;
          border-right: 1px solid #222;
        }
      `}</style>

      <div className="team-print-title">{divisionName} トーナメント表</div>
      <div className="team-print-subtitle">
        {tournamentName} / 団体戦形式: {teamMatchFormat ?? "-"}
      </div>

      {groups.map(([groupKey, group]) => (
        <PrintBracketGroup
          key={groupKey}
          groupLabel={group.label}
          groupMatches={group.matches}
        />
      ))}
    </main>
  );
}
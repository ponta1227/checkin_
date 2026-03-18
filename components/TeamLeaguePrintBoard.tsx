type TeamRow = {
  entryId: string;
  teamName: string;
};

type MatchCell = {
  matchId: string;
  rowEntryId: string;
  colEntryId: string;
  scoreText: string | null;
  status: string | null;
};

type StandingRow = {
  rank: number;
  entryId: string;
  teamName: string;
  teamAffiliation: string | null;
  played: number;
  wins: number;
  losses: number;
  teamPointsFor: number;
  teamPointsAgainst: number;
  teamPointDiff: number;
};

type LeagueBoardData = {
  groupNo: number;
  teams: TeamRow[];
  cells: MatchCell[];
  standings: StandingRow[];
};

type Props = {
  tournamentName: string;
  divisionName: string;
  teamMatchFormat: string | null;
  boards: LeagueBoardData[];
};

function PrintLeagueTable({
  groupNo,
  teams,
  cells,
  standings,
}: LeagueBoardData) {
  const cellMap = new Map<string, MatchCell>();
  for (const cell of cells ?? []) {
    cellMap.set(`${cell.rowEntryId}-${cell.colEntryId}`, cell);
  }

  const standingMap = new Map<string, StandingRow>();
  for (const row of standings ?? []) {
    standingMap.set(row.entryId, row);
  }

  return (
    <section className="team-print-group">
      <div className="team-print-group-title">第{groupNo}リーグ</div>

      <div style={{ overflow: "hidden", padding: "14px" }}>
        <table className="team-league-table">
          <thead>
            <tr>
              <th className="team-col-name">チーム名</th>

              {teams.map((team, index) => (
                <th key={team.entryId}>
                  <div>{index + 1}</div>
                  <div style={{ marginTop: "3px", fontWeight: 400 }}>{team.teamName}</div>
                </th>
              ))}

              <th className="team-col-mini">試</th>
              <th className="team-col-mini">勝</th>
              <th className="team-col-mini">敗</th>
              <th className="team-col-mini">得</th>
              <th className="team-col-mini">失</th>
              <th className="team-col-mini">差</th>
              <th className="team-col-mini">順</th>
            </tr>
          </thead>

          <tbody>
            {teams.map((rowTeam) => {
              const standing = standingMap.get(rowTeam.entryId);

              return (
                <tr key={rowTeam.entryId}>
                  <td className="team-col-name">{rowTeam.teamName}</td>

                  {teams.map((colTeam) => {
                    if (rowTeam.entryId === colTeam.entryId) {
                      return (
                        <td
                          key={`${rowTeam.entryId}-${colTeam.entryId}`}
                          className="team-league-diagonal"
                        >
                          ―
                        </td>
                      );
                    }

                    const cell =
                      cellMap.get(`${rowTeam.entryId}-${colTeam.entryId}`) ??
                      cellMap.get(`${colTeam.entryId}-${rowTeam.entryId}`);

                    return (
                      <td key={`${rowTeam.entryId}-${colTeam.entryId}`}>
                        {cell?.scoreText ?? "-"}
                      </td>
                    );
                  })}

                  <td>{standing?.played ?? 0}</td>
                  <td>{standing?.wins ?? 0}</td>
                  <td>{standing?.losses ?? 0}</td>
                  <td>{standing?.teamPointsFor ?? 0}</td>
                  <td>{standing?.teamPointsAgainst ?? 0}</td>
                  <td>{standing?.teamPointDiff ?? 0}</td>
                  <td>{standing?.rank ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TeamLeaguePrintBoard({
  tournamentName,
  divisionName,
  teamMatchFormat,
  boards,
}: Props) {
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

        .team-league-table {
          border-collapse: collapse;
          width: 100%;
          table-layout: fixed;
          font-size: 10px;
          background: white;
        }

        .team-league-table th,
        .team-league-table td {
          border: 1px solid #222;
          padding: 5px 4px;
          text-align: center;
          vertical-align: middle;
        }

        .team-league-table thead th {
          background: #f2f2f2;
        }

        .team-col-name { width: 120px; text-align: left !important; }
        .team-col-mini { width: 38px; }

        .team-league-diagonal {
          background: #efefef;
        }
      `}</style>

      <div className="team-print-title">{divisionName} リーグ表</div>
      <div className="team-print-subtitle">
        {tournamentName} / 団体戦形式: {teamMatchFormat ?? "-"}
      </div>

      {boards.map((board) => (
        <PrintLeagueTable
          key={board.groupNo}
          groupNo={board.groupNo}
          teams={board.teams}
          cells={board.cells}
          standings={board.standings}
        />
      ))}
    </main>
  );
}
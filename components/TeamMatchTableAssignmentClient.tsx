"use client";

import { useMemo, useState, useTransition } from "react";

type LeagueRow = {
  leagueGroupNo: number;
  assignedCourts: number[];
};

type Props = {
  tournamentId: string;
  divisionId: string;
  courtCount: number;
  leagueRows: LeagueRow[];
};

type LeagueAssignmentMap = Record<string, number[]>;

function normalizeCourts(values: Array<number | "">) {
  const nums = values
    .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1);

  const deduped: number[] = [];
  for (const n of nums) {
    if (!deduped.includes(n)) deduped.push(n);
  }
  return deduped.slice(0, 4);
}

export default function TeamMatchTableAssignmentClient({
  tournamentId,
  divisionId,
  courtCount,
  leagueRows,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [leagueAssignments, setLeagueAssignments] = useState<LeagueAssignmentMap>(() => {
    const init: LeagueAssignmentMap = {};
    for (const row of leagueRows) {
      init[String(row.leagueGroupNo)] = [...row.assignedCourts];
    }
    return init;
  });

  const usedCourtsByLeagues = useMemo(() => {
    const used = new Map<number, string[]>();
    for (const row of leagueRows) {
      const assigned = leagueAssignments[String(row.leagueGroupNo)] ?? [];
      for (const courtNo of assigned) {
        if (!used.has(courtNo)) used.set(courtNo, []);
        used.get(courtNo)!.push(`league-${row.leagueGroupNo}`);
      }
    }
    return used;
  }, [leagueRows, leagueAssignments]);

  function currentSlotValues(source: number[]) {
    const arr = [...source];
    while (arr.length < 4) arr.push(undefined as unknown as number);
    return arr.slice(0, 4).map((v) => (typeof v === "number" ? String(v) : ""));
  }

  function updateLeagueSlot(leagueGroupNo: number, slotIndex: number, rawValue: string) {
    setLeagueAssignments((prev) => {
      const current = [...(prev[String(leagueGroupNo)] ?? [])];
      while (current.length < 4) current.push(undefined as unknown as number);

      current[slotIndex] = rawValue === "" ? ("" as unknown as number) : Number(rawValue);

      return {
        ...prev,
        [String(leagueGroupNo)]: normalizeCourts(
          current.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : "")) as Array<
            number | ""
          >
        ),
      };
    });
  }

  function saveLeague(leagueGroupNo: number) {
    const courtNos = leagueAssignments[String(leagueGroupNo)] ?? [];
    const key = `league-${leagueGroupNo}`;

    setSavingKey(key);
    setMessage("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/team-matches/update-table-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tournamentId,
            divisionId,
            mode: "league",
            leagueGroupNo,
            courtNos,
          }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "リーグのコート保存に失敗しました。");

        setMessage(`第${leagueGroupNo}リーグのコートを保存しました。`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "リーグのコート保存に失敗しました。");
      } finally {
        setSavingKey(null);
      }
    });
  }

  if (courtCount <= 0) {
    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          padding: "16px",
          color: "#666",
          marginBottom: "20px",
        }}
      >
        先に「使用コート数」を設定してください。
      </div>
    );
  }

  if (leagueRows.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: "10px",
        background: "white",
        overflow: "hidden",
        marginBottom: "20px",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee", fontWeight: 700 }}>
        リーグごとのコート割り当て
      </div>

      {message ? (
        <div
          style={{
            margin: "12px 16px 0 16px",
            padding: "10px 12px",
            border: "1px solid #eee",
            borderRadius: "8px",
            background: "#fafafa",
            color: "#444",
          }}
        >
          {message}
        </div>
      ) : null}

      <div style={{ overflowX: "auto", padding: "16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={thStyle()}>リーグ</th>
              <th style={thStyle()}>コート1</th>
              <th style={thStyle()}>コート2</th>
              <th style={thStyle()}>コート3</th>
              <th style={thStyle()}>コート4</th>
              <th style={thStyle()}>保存</th>
            </tr>
          </thead>
          <tbody>
            {leagueRows.map((row) => {
              const slotValues = currentSlotValues(
                leagueAssignments[String(row.leagueGroupNo)] ?? []
              );

              return (
                <tr key={row.leagueGroupNo}>
                  <td style={tdStyle("center")}>第{row.leagueGroupNo}リーグ</td>

                  {[0, 1, 2, 3].map((slotIndex) => (
                    <td key={`${row.leagueGroupNo}-${slotIndex}`} style={tdStyle("center")}>
                      <select
                        value={slotValues[slotIndex]}
                        onChange={(e) =>
                          updateLeagueSlot(row.leagueGroupNo, slotIndex, e.target.value)
                        }
                        style={selectStyle()}
                      >
                        <option value="">未設定</option>
                        {Array.from({ length: courtCount }, (_, i) => i + 1).map((courtNo) => {
                          const usedBy = usedCourtsByLeagues.get(courtNo) ?? [];
                          const usedByOther = usedBy.some(
                            (id) => id !== `league-${row.leagueGroupNo}`
                          );

                          return (
                            <option
                              key={courtNo}
                              value={courtNo}
                              style={{ color: usedByOther ? "#999" : "#111" }}
                            >
                              {courtNo}コート
                            </option>
                          );
                        })}
                      </select>
                    </td>
                  ))}

                  <td style={tdStyle("center")}>
                    <button
                      type="button"
                      disabled={isPending && savingKey === `league-${row.leagueGroupNo}`}
                      onClick={() => saveLeague(row.leagueGroupNo)}
                      style={saveButtonStyle()}
                    >
                      保存
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function thStyle(): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #eee",
    textAlign: "center",
  };
}

function tdStyle(align: "left" | "center"): React.CSSProperties {
  return {
    padding: "12px",
    borderBottom: "1px solid #f0f0f0",
    textAlign: align,
    verticalAlign: "top",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    width: "104px",
    padding: "8px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
  };
}

function saveButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    background: "white",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
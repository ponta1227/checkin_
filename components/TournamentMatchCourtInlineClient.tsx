"use client";

import { useMemo, useState, useTransition } from "react";

type Props = {
  tournamentId: string;
  divisionId: string;
  matchId: string;
  courtCount: number;
  assignedCourts: number[];
  allTournamentAssignments: Array<{
    matchId: string;
    assignedCourts: number[];
  }>;
};

function normalizeCourts(values: Array<number | "">) {
  const nums = values
    .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1);

  const deduped: number[] = [];
  for (const n of nums) {
    if (!deduped.includes(n)) deduped.push(n);
  }
  return deduped.slice(0, 4);
}

export default function TournamentMatchCourtInlineClient({
  tournamentId,
  divisionId,
  matchId,
  courtCount,
  assignedCourts,
  allTournamentAssignments,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [localCourts, setLocalCourts] = useState<number[]>(assignedCourts);

  const usedByOtherMatches = useMemo(() => {
    const used = new Set<number>();

    for (const row of allTournamentAssignments) {
      if (row.matchId === matchId) continue;
      for (const courtNo of row.assignedCourts) {
        used.add(courtNo);
      }
    }

    return used;
  }, [allTournamentAssignments, matchId]);

  function currentSlotValues() {
    const arr = [...localCourts];
    while (arr.length < 4) arr.push(undefined as unknown as number);
    return arr.slice(0, 4).map((v) => (typeof v === "number" ? String(v) : ""));
  }

  function updateSlot(slotIndex: number, rawValue: string) {
    setLocalCourts((prev) => {
      const current = [...prev];
      while (current.length < 4) current.push(undefined as unknown as number);

      current[slotIndex] = rawValue === "" ? ("" as unknown as number) : Number(rawValue);

      return normalizeCourts(
        current.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : "")) as Array<
          number | ""
        >
      );
    });
  }

  function save() {
    setMessage("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/team-matches/update-table-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tournamentId,
            divisionId,
            mode: "match",
            matchId,
            courtNos: localCourts,
          }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "コート保存に失敗しました。");

        setMessage("保存しました");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "コート保存に失敗しました。");
      }
    });
  }

  if (courtCount <= 0) {
    return <span style={{ color: "#666" }}>未設定</span>;
  }

  const slotValues = currentSlotValues();

  return (
    <div style={{ display: "grid", gap: "8px", minWidth: "132px" }}>
      {[0, 1, 2, 3].map((slotIndex) => (
        <select
          key={`${matchId}-${slotIndex}`}
          value={slotValues[slotIndex]}
          onChange={(e) => updateSlot(slotIndex, e.target.value)}
          style={{
            width: "120px",
            padding: "6px 8px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            background: "white",
            fontSize: "12px",
          }}
        >
          <option value="">未設定</option>
          {Array.from({ length: courtCount }, (_, i) => i + 1).map((courtNo) => {
            const selectedHere = localCourts.includes(courtNo);
            const unusedAnywhere = !usedByOtherMatches.has(courtNo) && !selectedHere;

            let color = "#999";
            if (selectedHere) {
              color = "#111";
            } else if (unusedAnywhere) {
              color = "#d11";
            }

            return (
              <option key={courtNo} value={courtNo} style={{ color }}>
                {courtNo}コート
              </option>
            );
          })}
        </select>
      ))}

      <button
        type="button"
        disabled={isPending}
        onClick={save}
        style={{
          padding: "7px 10px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          background: "white",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        保存
      </button>

      {message ? <div style={{ fontSize: "11px", color: "#666" }}>{message}</div> : null}
    </div>
  );
}
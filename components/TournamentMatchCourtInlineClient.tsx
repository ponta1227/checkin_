"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type TournamentAssignmentRow = {
  matchId: string;
  assignedCourts: number[];
};

type Props = {
  tournamentId: string;
  divisionId: string;
  matchId: string;
  courtCount: number;
  assignedCourts: number[];
  allTournamentAssignments: TournamentAssignmentRow[];
};

function stringifyCourtNumbers(values: number[] | null | undefined): string {
  return Array.isArray(values) && values.length > 0 ? values.join(",") : "";
}

function parseCourtNumbers(value: string): number[] {
  return value
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export default function TournamentMatchCourtInlineClient({
  divisionId,
  matchId,
  courtCount,
  assignedCourts,
  allTournamentAssignments,
}: Props) {
  const [courtText, setCourtText] = useState(stringifyCourtNumbers(assignedCourts));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCourtText(stringifyCourtNumbers(assignedCourts));
  }, [assignedCourts]);

  const usedByOtherMatches = useMemo(() => {
    const current = new Set(assignedCourts);
    const used = new Set<number>();

    for (const row of allTournamentAssignments) {
      if (row.matchId === matchId) continue;
      for (const n of row.assignedCourts ?? []) {
        if (!current.has(n)) used.add(n);
      }
    }

    return Array.from(used).sort((a, b) => a - b);
  }, [allTournamentAssignments, assignedCourts, matchId]);

  function save() {
    const courtNumbers = parseCourtNumbers(courtText);

    startTransition(async () => {
      try {
        const res = await fetch("/api/team-matches/update-match-courts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            divisionId,
            matchId,
            courtNumbers,
          }),
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "試合コート保存に失敗しました。");
        }

        setMessage("保存しました");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "試合コート保存に失敗しました。"
        );
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: "6px", justifyItems: "center" }}>
      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={courtText}
          onChange={(e) => setCourtText(e.target.value)}
          placeholder="例: 3 または 1,4"
          style={{
            width: "130px",
            padding: "6px 8px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          style={{
            padding: "6px 10px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            background: "white",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          保存
        </button>
      </div>

      <div style={{ fontSize: "12px", color: "#666", textAlign: "center" }}>
        {parseCourtNumbers(courtText).length > 0
          ? parseCourtNumbers(courtText)
              .map((n) => `${n}コート`)
              .join(", ")
          : "未設定"}
      </div>

      {usedByOtherMatches.length > 0 ? (
        <div style={{ fontSize: "11px", color: "#999", textAlign: "center" }}>
          他試合で使用中: {usedByOtherMatches.join(", ")}
          {courtCount > 0 ? ` / 全${courtCount}コート` : ""}
        </div>
      ) : courtCount > 0 ? (
        <div style={{ fontSize: "11px", color: "#999", textAlign: "center" }}>
          全{courtCount}コート
        </div>
      ) : null}

      {message ? (
        <div style={{ fontSize: "11px", color: "#666", textAlign: "center" }}>{message}</div>
      ) : null}
    </div>
  );
}
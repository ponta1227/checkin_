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

function stringifyCourtNumbers(values: number[] | null | undefined): string {
  return Array.isArray(values) && values.length > 0 ? values.join(",") : "";
}

function parseCourtNumbers(value: string): number[] {
  return value
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export default function TeamMatchTableAssignmentClient({
  divisionId,
  courtCount,
  leagueRows,
}: Props) {
  const initialMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const row of leagueRows) {
      map[row.leagueGroupNo] = stringifyCourtNumbers(row.assignedCourts);
    }
    return map;
  }, [leagueRows]);

  const [courtTexts, setCourtTexts] = useState<Record<number, string>>(initialMap);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();

  function updateText(groupNo: number, value: string) {
    setCourtTexts((prev) => ({ ...prev, [groupNo]: value }));
  }

  function saveGroup(groupNo: number) {
    const raw = courtTexts[groupNo] ?? "";
    const courtNumbers = parseCourtNumbers(raw);

    startTransition(async () => {
      try {
        const res = await fetch("/api/team-matches/update-league-courts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            divisionId,
            leagueGroupNo: groupNo,
            courtNumbers,
          }),
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "リーグコート保存に失敗しました。");
        }

        setMessages((prev) => ({
          ...prev,
          [groupNo]: "保存しました",
        }));
      } catch (error) {
        setMessages((prev) => ({
          ...prev,
          [groupNo]:
            error instanceof Error ? error.message : "リーグコート保存に失敗しました。",
        }));
      }
    });
  }

  if (leagueRows.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: "10px",
        background: "white",
        padding: "16px",
        marginTop: "20px",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
        リーグごとのコート割り当て
      </h2>

      <p style={{ marginTop: 0, color: "#666", lineHeight: 1.7 }}>
        手入力でコート番号を保存できます。複数使う場合はカンマ区切りで入力してください。
        <br />
        例: <code>1</code> / <code>1,2</code>
        {courtCount > 0 ? (
          <>
            <br />
            現在の使用コート数設定: {courtCount}
          </>
        ) : null}
      </p>

      <div style={{ display: "grid", gap: "12px" }}>
        {leagueRows.map((row) => (
          <div
            key={row.leagueGroupNo}
            style={{
              border: "1px solid #eee",
              borderRadius: "8px",
              padding: "12px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontWeight: 700 }}>第{row.leagueGroupNo}リーグ</div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                value={courtTexts[row.leagueGroupNo] ?? ""}
                onChange={(e) => updateText(row.leagueGroupNo, e.target.value)}
                placeholder="例: 1 または 1,2"
                style={{
                  width: "180px",
                  padding: "8px 10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />

              <button
                type="button"
                onClick={() => saveGroup(row.leagueGroupNo)}
                disabled={isPending}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                保存
              </button>

              <span style={{ fontSize: "13px", color: "#666" }}>
                表示:{" "}
                {parseCourtNumbers(courtTexts[row.leagueGroupNo] ?? "").length > 0
                  ? parseCourtNumbers(courtTexts[row.leagueGroupNo] ?? "")
                      .map((n) => `${n}コート`)
                      .join(", ")
                  : "未設定"}
              </span>
            </div>

            {messages[row.leagueGroupNo] ? (
              <div style={{ fontSize: "13px", color: "#666" }}>
                {messages[row.leagueGroupNo]}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
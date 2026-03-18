"use client";

import { useMemo, useState, useTransition } from "react";

type TeamOption = {
  entryId: string;
  teamName: string;
  memberRequired: boolean;
  members: string[];
  status: string | null;
  checkinStatus: string | null;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  divisionName: string;
  teams: TeamOption[];
};

export default function PublicTeamCheckinClient({
  tournamentId,
  divisionId,
  divisionName,
  teams,
}: Props) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [mode, setMode] = useState<"checkin" | "withdraw">("checkin");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const selectedTeam = useMemo(
    () => teams.find((t) => t.entryId === selectedEntryId) ?? null,
    [teams, selectedEntryId]
  );

  const [memberInputs, setMemberInputs] = useState<string[]>([]);

  function syncMembersFromTeam(entryId: string) {
    const team = teams.find((t) => t.entryId === entryId);
    if (!team) {
      setMemberInputs([]);
      return;
    }
    setMemberInputs(team.members.length > 0 ? [...team.members] : [""]);
  }

  function updateMember(index: number, value: string) {
    setMemberInputs((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addMemberRow() {
    setMemberInputs((prev) => [...prev, ""]);
  }

  function removeMemberRow(index: number) {
    setMemberInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    if (!selectedEntryId) {
      setMessage("チームを選択してください。");
      return;
    }

    const cleanedMembers = memberInputs
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (mode === "checkin" && selectedTeam?.memberRequired && cleanedMembers.length === 0) {
      setMessage("この大会では参加選手の登録が必須です。");
      return;
    }

    setMessage("");

    startTransition(async () => {
      try {
        const endpoint =
          mode === "checkin" ? "/api/public-team-checkin" : "/api/public-team-withdraw";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tournamentId,
            divisionId,
            entryId: selectedEntryId,
            members: cleanedMembers,
          }),
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "送信に失敗しました。");
        }

        setMessage(
          mode === "checkin"
            ? "受付を送信しました。画面を再読み込みすると状態が反映されます。"
            : "棄権を送信しました。画面を再読み込みすると状態が反映されます。"
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "送信に失敗しました。");
      }
    });
  }

  return (
    <main style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "8px" }}>受付ページ</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "20px" }}>
        種目: {divisionName}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          padding: "16px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <label>チーム名</label>
          <select
            value={selectedEntryId}
            onChange={(e) => {
              setSelectedEntryId(e.target.value);
              syncMembersFromTeam(e.target.value);
            }}
            style={inputStyle}
          >
            <option value="">選択してください</option>
            {teams.map((team) => (
              <option key={team.entryId} value={team.entryId}>
                {team.teamName}
                {team.checkinStatus === "checked_in" ? "（受付済み）" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedTeam && (
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: "8px",
              padding: "12px",
              background: "#fafafa",
              fontSize: "14px",
            }}
          >
            <div>
              チーム: {selectedTeam.teamName}
              {selectedTeam.checkinStatus === "checked_in" ? "（受付済み）" : ""}
            </div>
            <div style={{ marginTop: "6px" }}>
              現在の状態: {selectedTeam.checkinStatus ?? "未受付"}
            </div>
            <div style={{ marginTop: "6px" }}>
              エントリー状態: {selectedTeam.status ?? "-"}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              checked={mode === "checkin"}
              onChange={() => setMode("checkin")}
            />
            受付
          </label>

          <label style={radioLabelStyle}>
            <input
              type="radio"
              checked={mode === "withdraw"}
              onChange={() => setMode("withdraw")}
            />
            棄権
          </label>
        </div>

        {mode === "checkin" && (
          <section
            style={{
              border: "1px solid #eee",
              borderRadius: "8px",
              padding: "12px",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontWeight: 700 }}>参加選手確認</div>
            <div style={{ color: "#666", fontSize: "14px" }}>
              変更や追加がある場合は修正してください。
            </div>

            {memberInputs.map((member, index) => (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "8px",
                }}
              >
                <input
                  value={member}
                  onChange={(e) => updateMember(index, e.target.value)}
                  placeholder={`選手名 ${index + 1}`}
                  style={inputStyle}
                />
                <button type="button" onClick={() => removeMemberRow(index)} style={smallButtonStyle}>
                  削除
                </button>
              </div>
            ))}

            <div>
              <button type="button" onClick={addMemberRow} style={smallButtonStyle}>
                選手を追加
              </button>
            </div>
          </section>
        )}

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            style={primaryButtonStyle}
          >
            {mode === "checkin" ? "受付しますか" : "棄権を申告しますか"}
          </button>
        </div>

        {message ? (
          <div
            style={{
              padding: "12px",
              border: "1px solid #eee",
              borderRadius: "8px",
              background: "#fafafa",
            }}
          >
            {message}
          </div>
        ) : null}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
};

const radioLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};
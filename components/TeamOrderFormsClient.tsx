"use client";

type TeamMember = {
  id: string;
  name: string;
  affiliation?: string | null;
};

type Board = {
  boardNo: number;
  type: "W" | "S" | "T";
  label: string;
  requiredAtInitialOrder: boolean;
};

type Props = {
  tournamentId: string;
  divisionId: string;
  matchId: string;
  teamChoice: "team1" | "team2";
  boards: Board[];
  selectedTeamMembers: TeamMember[];
  initialOrderLocked: boolean;
  format: string;
  canSubmitFifth: boolean;
};

export default function TeamOrderFormsClient({
  tournamentId,
  divisionId,
  matchId,
  teamChoice,
  boards,
  selectedTeamMembers,
  initialOrderLocked,
  canSubmitFifth,
}: Props) {
  return (
    <>
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
          オーダー入力
        </h2>

        <p style={{ marginTop: 0, color: "#666" }}>
          登録メンバーから選択してください。提出後は初回オーダーを変更できません。
        </p>

        {initialOrderLocked ? (
          <div
            style={{
              padding: "12px",
              border: "1px solid #eee",
              borderRadius: "8px",
              background: "#fafafa",
            }}
          >
            このチームの初回オーダーは提出済みです。
          </div>
        ) : (
          <form
            action="/api/team-match-orders/submit"
            method="post"
            onSubmit={(e) => {
              const form = e.currentTarget;
              const payload = boards
                .filter((b) => b.requiredAtInitialOrder)
                .map((board) => {
                  const m1 =
                    (form.elements.namedItem(
                      `board_${board.boardNo}_member1`
                    ) as HTMLSelectElement | null)?.value ?? "";
                  const m2 =
                    (form.elements.namedItem(
                      `board_${board.boardNo}_member2`
                    ) as HTMLSelectElement | null)?.value ?? "";

                  return {
                    boardNo: board.boardNo,
                    matchType: board.type,
                    memberIds:
                      board.type === "W"
                        ? [m1, m2].filter(Boolean)
                        : [m1].filter(Boolean),
                  };
                });

              const hidden = form.elements.namedItem(
                "selectionsJson"
              ) as HTMLInputElement | null;
              if (hidden) {
                hidden.value = JSON.stringify(payload);
              }
            }}
            style={{ display: "grid", gap: "16px" }}
          >
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="divisionId" value={divisionId} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="teamChoice" value={teamChoice} />
            <input type="hidden" name="selectionsJson" value="[]" />

            {boards
              .filter((b) => b.requiredAtInitialOrder)
              .map((board) => (
                <div
                  key={board.boardNo}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                    {board.label}
                  </div>

                  {board.type === "W" ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px",
                      }}
                    >
                      <select
                        name={`board_${board.boardNo}_member1`}
                        defaultValue=""
                        style={{
                          padding: "10px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                          background: "white",
                        }}
                      >
                        <option value="">1人目を選択</option>
                        {selectedTeamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>

                      <select
                        name={`board_${board.boardNo}_member2`}
                        defaultValue=""
                        style={{
                          padding: "10px",
                          border: "1px solid #ccc",
                          borderRadius: "8px",
                          background: "white",
                        }}
                      >
                        <option value="">2人目を選択</option>
                        {selectedTeamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <select
                      name={`board_${board.boardNo}_member1`}
                      defaultValue=""
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                        background: "white",
                      }}
                    >
                      <option value="">選手を選択</option>
                      {selectedTeamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

            <label style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <input type="checkbox" name="confirmed" value="true" />
              このオーダーで提出します
            </label>

            <label style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <input type="checkbox" name="reconfirmed" value="true" />
              提出後は変更できません。本当に大丈夫ですか？
            </label>

            <div>
              <button
                type="submit"
                style={{
                  padding: "12px 16px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                オーダーを提出
              </button>
            </div>
          </form>
        )}
      </section>

      {canSubmitFifth && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
            5番オーダー入力（Tリーグ方式）
          </h2>

          <p style={{ marginTop: 0, color: "#666" }}>
            4番終了時点で 2-2 になったため、5番の入力が必要です。
          </p>

          <form
            action="/api/team-match-orders/submit-fifth-board"
            method="post"
            onSubmit={(e) => {
              const form = e.currentTarget;
              const m1 =
                (form.elements.namedItem("fifth_member1") as HTMLSelectElement | null)
                  ?.value ?? "";
              const payload = {
                boardNo: 5,
                memberIds: [m1].filter(Boolean),
              };

              const hidden = form.elements.namedItem(
                "payloadJson"
              ) as HTMLInputElement | null;
              if (hidden) {
                hidden.value = JSON.stringify(payload);
              }
            }}
            style={{ display: "grid", gap: "12px" }}
          >
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="divisionId" value={divisionId} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="teamChoice" value={teamChoice} />
            <input type="hidden" name="payloadJson" value="{}" />

            <select
              name="fifth_member1"
              defaultValue=""
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
                background: "white",
              }}
            >
              <option value="">5番の選手を選択</option>
              {selectedTeamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>

            <div>
              <button
                type="submit"
                style={{
                  padding: "12px 16px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                5番を提出
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
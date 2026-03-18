"use client";

type TeamMemberFormRow = {
  name: string;
  affiliation: string;
  seed: string;
  applicationRank: string;
};

type Props = {
  tournamentId?: string;
  divisionId: string;
  entryId?: string;
  defaultTeamName: string;
  defaultTeamAffiliation: string;
  defaultSeed: string;
  defaultApplicationRank: string;
  defaultMembers: TeamMemberFormRow[];
  teamMemberRequired: boolean;
  teamMemberCountMin: number | null;
  teamMemberCountMax: number | null;
  submitUrl: string;
  submitLabel: string;
};

export default function TeamEntryFormClient(props: Props) {
  const members =
    props.defaultMembers.length > 0
      ? props.defaultMembers
      : Array.from({ length: 8 }, () => ({
          name: "",
          affiliation: "",
          seed: "",
          applicationRank: "",
        }));

  return (
    <form
      action={props.submitUrl}
      method="post"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const members = Array.from({ length: 8 }, (_, i) => {
          const name =
            (form.elements.namedItem(`member_name_${i}`) as HTMLInputElement | null)
              ?.value ?? "";
          const affiliation =
            (form.elements.namedItem(`member_affiliation_${i}`) as HTMLInputElement | null)
              ?.value ?? "";
          const seed =
            (form.elements.namedItem(`member_seed_${i}`) as HTMLInputElement | null)
              ?.value ?? "";
          const applicationRank =
            (
              form.elements.namedItem(
                `member_application_rank_${i}`
              ) as HTMLInputElement | null
            )?.value ?? "";

          return {
            name,
            affiliation,
            seed,
            applicationRank,
          };
        });

        const hidden = form.elements.namedItem("teamMembersJson") as HTMLInputElement | null;
        if (hidden) {
          hidden.value = JSON.stringify(members);
        }
      }}
      style={{ display: "grid", gap: "20px" }}
    >
      {props.tournamentId ? (
        <input type="hidden" name="tournamentId" value={props.tournamentId} />
      ) : null}
      <input type="hidden" name="divisionId" value={props.divisionId} />
      {props.entryId ? <input type="hidden" name="entryId" value={props.entryId} /> : null}
      <input type="hidden" name="teamMembersJson" value="[]" />

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>
          チーム情報
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <label htmlFor="teamName">チーム名</label>
            <input
              id="teamName"
              name="teamName"
              type="text"
              required
              defaultValue={props.defaultTeamName}
              style={{
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <label htmlFor="teamAffiliation">所属</label>
            <input
              id="teamAffiliation"
              name="teamAffiliation"
              type="text"
              defaultValue={props.defaultTeamAffiliation}
              style={{
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <label htmlFor="seed">シード</label>
            <input
              id="seed"
              name="seed"
              type="number"
              min={1}
              defaultValue={props.defaultSeed}
              style={{
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <label htmlFor="applicationRank">申込順位</label>
            <input
              id="applicationRank"
              name="applicationRank"
              type="number"
              min={1}
              defaultValue={props.defaultApplicationRank}
              style={{
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            />
          </div>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "16px",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>
          チームメンバー
        </h2>

        <p style={{ marginTop: 0, color: "#666", marginBottom: "16px" }}>
          {props.teamMemberRequired
            ? "この大会ではメンバー登録が必須です。"
            : "この大会ではメンバー登録は任意です。"}
          {props.teamMemberCountMin !== null ? ` 最低 ${props.teamMemberCountMin} 名。` : ""}
          {props.teamMemberCountMax !== null ? ` 最大 ${props.teamMemberCountMax} 名。` : ""}
        </p>

        <div style={{ display: "grid", gap: "10px" }}>
          {members.map((member, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.8fr 0.9fr",
                gap: "8px",
              }}
            >
              <input
                name={`member_name_${index}`}
                placeholder={`メンバー名 ${index + 1}`}
                defaultValue={member.name}
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
              <input
                name={`member_affiliation_${index}`}
                placeholder="所属"
                defaultValue={member.affiliation}
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
              <input
                name={`member_seed_${index}`}
                type="number"
                min={1}
                placeholder="seed"
                defaultValue={member.seed}
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
              <input
                name={`member_application_rank_${index}`}
                type="number"
                min={1}
                placeholder="申込順位"
                defaultValue={member.applicationRank}
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <div>
        <button
          type="submit"
          style={{
            padding: "12px 18px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            background: "white",
            cursor: "pointer",
          }}
        >
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}
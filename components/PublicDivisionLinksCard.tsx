type Props = {
  tournamentId: string;
  divisionId: string;
  token: string | null;
};

export default function PublicDivisionLinksCard({
  tournamentId,
  divisionId,
  token,
}: Props) {
  const checkinUrl = token
    ? `/public/tournaments/${tournamentId}/divisions/${divisionId}/checkin/${token}`
    : "";
  const progressUrl = token
    ? `/public/tournaments/${tournamentId}/divisions/${divisionId}/progress/${token}`
    : "";

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: "10px",
        background: "white",
        padding: "16px",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "12px", fontSize: "18px" }}>
        参加者向けページ
      </h2>

      <form
        action="/api/divisions/rotate-public-token"
        method="post"
        style={{ marginBottom: "16px" }}
      >
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input
          type="hidden"
          name="returnPath"
          value={`/admin/tournaments/${tournamentId}/divisions/${divisionId}`}
        />
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            background: "white",
            cursor: "pointer",
          }}
        >
          公開トークンを再発行
        </button>
      </form>

      {token ? (
        <div style={{ display: "grid", gap: "12px" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>受付ページURL</div>
            <div
              style={{
                wordBreak: "break-all",
                padding: "10px 12px",
                border: "1px solid #eee",
                borderRadius: "8px",
                background: "#fafafa",
              }}
            >
              {checkinUrl}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>進行確認・結果入力URL</div>
            <div
              style={{
                wordBreak: "break-all",
                padding: "10px 12px",
                border: "1px solid #eee",
                borderRadius: "8px",
                background: "#fafafa",
              }}
            >
              {progressUrl}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: "#666" }}>
          まだ公開トークンがありません。再発行ボタンを押してください。
        </p>
      )}
    </section>
  );
}
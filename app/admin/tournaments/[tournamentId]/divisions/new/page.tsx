import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDivisionAction } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tournamentId: string }>;
};

export default async function NewDivisionPage({ params }: PageProps) {
  const { tournamentId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  return (
    <main style={{ padding: "24px", maxWidth: "860px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href={`/admin/tournaments/${tournamentId}`}>← 大会管理へ戻る</Link>
      </div>

      <h1 style={{ marginBottom: "8px" }}>種目を作成</h1>
      <p style={{ marginTop: 0, color: "#555", marginBottom: "24px" }}>
        大会: {tournament?.name ?? "-"}
      </p>

      <form action={createDivisionAction} style={{ display: "grid", gap: "20px" }}>
        <input type="hidden" name="tournamentId" value={tournamentId} />

        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "16px",
            background: "white",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>
            基本情報
          </h2>

          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="name">種目名</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="例: 男子シングルス / 男子団体"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="eventType">種目タイプ</label>
              <select
                id="eventType"
                name="eventType"
                defaultValue="singles"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                }}
              >
                <option value="singles">個人戦</option>
                <option value="team">団体戦</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="format">試合形式</label>
              <select
                id="format"
                name="format"
                defaultValue="league"
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                }}
              >
                <option value="league">リーグ戦</option>
                <option value="knockout">トーナメント戦</option>
                <option value="league_then_knockout">リーグ→トーナメント戦</option>
              </select>
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
          <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>
            団体戦設定
          </h2>

          <p style={{ marginTop: 0, color: "#666", marginBottom: "16px" }}>
            個人戦の場合は入力しても無視されます。
          </p>

          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <label htmlFor="teamMatchFormat">団体戦形式</label>
              <select
                id="teamMatchFormat"
                name="teamMatchFormat"
                defaultValue=""
                style={{
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "white",
                }}
              >
                <option value="">選択してください</option>
                <option value="WSSSS">WSSSS</option>
                <option value="WSS">WSS</option>
                <option value="WWW">WWW</option>
                <option value="WSSSW">WSSSW</option>
                <option value="T_LEAGUE">Tリーグ方式</option>
              </select>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <input type="checkbox" name="teamMemberRequired" />
              チームメンバー登録を必須にする
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <label htmlFor="teamMemberCountMin">チームメンバー最低人数</label>
                <input
                  id="teamMemberCountMin"
                  name="teamMemberCountMin"
                  type="number"
                  min={0}
                  placeholder="例: 4"
                  style={{
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                <label htmlFor="teamMemberCountMax">チームメンバー最大人数</label>
                <input
                  id="teamMemberCountMax"
                  name="teamMemberCountMax"
                  type="number"
                  min={0}
                  placeholder="例: 6"
                  style={{
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              </div>
            </div>
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
            種目を作成
          </button>
        </div>
      </form>
    </main>
  );
}
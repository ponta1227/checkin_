"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  tournamentId: string;
  divisionId: string;
};

export default function CsvImportForm({
  tournamentId,
  divisionId,
}: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      alert("CSVファイルを選択してください。");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("tournamentId", tournamentId);
      formData.append("divisionId", divisionId);
      formData.append("csvFile", file);

      const response = await fetch("/api/divisions/import-csv", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        const params = new URLSearchParams();
        params.set("error", result.error ?? "upload_failed");
        if (result.error_detail) {
          params.set("error_detail", result.error_detail);
        }

        router.push(
          `/admin/tournaments/${tournamentId}/divisions/${divisionId}/import-csv?${params.toString()}`
        );
        router.refresh();
        return;
      }

      const params = new URLSearchParams();
      params.set("success", "1");
      params.set("players_created", String(result.players_created ?? 0));
      params.set("players_reused", String(result.players_reused ?? 0));
      params.set("entries_created", String(result.entries_created ?? 0));
      params.set("entries_skipped", String(result.entries_skipped ?? 0));

      router.push(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/import-csv?${params.toString()}`
      );
      router.refresh();
    } catch (error) {
      const params = new URLSearchParams();
      params.set("error", "upload_failed");
      params.set(
        "error_detail",
        error instanceof Error ? error.message : "unknown error"
      );

      router.push(
        `/admin/tournaments/${tournamentId}/divisions/${divisionId}/import-csv?${params.toString()}`
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="csvFile"
          style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
        >
          CSVファイル
        </label>
        <input
          id="csvFile"
          name="csvFile"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "10px 16px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          background: "white",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "取込中..." : "CSVを取り込む"}
      </button>
    </form>
  );
}
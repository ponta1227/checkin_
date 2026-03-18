"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type Props = {
  targetId?: string;
  fileName: string;
};

export default function PdfDownloadButton({
  targetId = "pdf-target",
  fileName,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    try {
      setLoading(true);

      const target = document.getElementById(targetId);
      if (!target) {
        alert("PDF化する対象が見つかりませんでした。");
        return;
      }

      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 8;

      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;

      const imageWidth = contentWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      let remainingHeight = imageHeight;
      let positionY = margin;

      pdf.addImage(
        imgData,
        "PNG",
        margin,
        positionY,
        imageWidth,
        imageHeight,
        undefined,
        "FAST"
      );

      remainingHeight -= contentHeight;

      while (remainingHeight > 0) {
        pdf.addPage();
        positionY = margin - (imageHeight - remainingHeight);

        pdf.addImage(
          imgData,
          "PNG",
          margin,
          positionY,
          imageWidth,
          imageHeight,
          undefined,
          "FAST"
        );

        remainingHeight -= contentHeight;
      }

      const safeFileName = fileName.endsWith(".pdf")
        ? fileName
        : `${fileName}.pdf`;

      pdf.save(safeFileName);
    } catch (error) {
      console.error(error);
      alert("PDFの作成に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      style={{
        padding: "10px 14px",
        border: "1px solid #ccc",
        borderRadius: "8px",
        background: "white",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {loading ? "PDF作成中..." : "PDFダウンロード"}
    </button>
  );
}
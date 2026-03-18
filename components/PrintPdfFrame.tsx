"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import PdfDownloadButton from "@/components/PdfDownloadButton";

type Props = {
  children: ReactNode;
  tournamentName?: string | null;
  divisionName?: string | null;
};

function sanitizeFileNamePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFileName(params: {
  pathname: string;
  tournamentName?: string | null;
  divisionName?: string | null;
}) {
  const { pathname, tournamentName, divisionName } = params;

  const safeTournamentName = sanitizeFileNamePart(
    tournamentName && tournamentName.trim() ? tournamentName : "大会"
  );
  const safeDivisionName = sanitizeFileNamePart(
    divisionName && divisionName.trim() ? divisionName : "種目"
  );

  let suffix = "印刷";

  if (pathname.endsWith("/print/bracket")) {
    suffix = "トーナメント表";
  } else if (pathname.endsWith("/print/league")) {
    suffix = "リーグ表";
  } else if (pathname.endsWith("/print/league-knockout")) {
    suffix = "順位別トーナメント表";
  }

  return `${safeTournamentName}_${safeDivisionName}_${suffix}.pdf`;
}

export default function PrintPdfFrame({
  children,
  tournamentName,
  divisionName,
}: Props) {
  const pathname = usePathname();

  const isHubPage = pathname.endsWith("/print");

  return (
    <>
      {!isHubPage && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            right: "16px",
            bottom: "16px",
            zIndex: 9999,
          }}
        >
          <PdfDownloadButton
            fileName={buildFileName({
              pathname,
              tournamentName,
              divisionName,
            })}
          />
        </div>
      )}

      <div id="pdf-target">{children}</div>
    </>
  );
}
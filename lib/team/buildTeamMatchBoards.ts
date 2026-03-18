export type TeamBoardType = "W" | "S" | "T";

export type TeamBoard = {
  boardNo: number;
  type: TeamBoardType;
  label: string;
  requiredAtInitialOrder: boolean;
  onlyIfTiedAfterBoard4?: boolean;
};

export function buildTeamMatchBoards(format: string): TeamBoard[] {
  switch (format) {
    case "WSSSS":
      return [
        { boardNo: 1, type: "W", label: "1番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 2, type: "S", label: "2番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 3, type: "S", label: "3番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 4, type: "S", label: "4番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 5, type: "S", label: "5番 シングルス", requiredAtInitialOrder: true },
      ];

    case "WSS":
      return [
        { boardNo: 1, type: "W", label: "1番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 2, type: "S", label: "2番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 3, type: "S", label: "3番 シングルス", requiredAtInitialOrder: true },
      ];

    case "WWW":
      return [
        { boardNo: 1, type: "W", label: "1番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 2, type: "W", label: "2番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 3, type: "W", label: "3番 ダブルス", requiredAtInitialOrder: true },
      ];

    case "WSSSW":
      return [
        { boardNo: 1, type: "W", label: "1番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 2, type: "S", label: "2番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 3, type: "S", label: "3番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 4, type: "S", label: "4番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 5, type: "W", label: "5番 ダブルス", requiredAtInitialOrder: true },
      ];

    case "T_LEAGUE":
      return [
        { boardNo: 1, type: "W", label: "1番 ダブルス", requiredAtInitialOrder: true },
        { boardNo: 2, type: "S", label: "2番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 3, type: "S", label: "3番 シングルス", requiredAtInitialOrder: true },
        { boardNo: 4, type: "S", label: "4番 シングルス", requiredAtInitialOrder: true },
        {
          boardNo: 5,
          type: "T",
          label: "5番 ビクトリーマッチ",
          requiredAtInitialOrder: false,
          onlyIfTiedAfterBoard4: true,
        },
      ];

    default:
      return [];
  }
}

export function getRequiredInitialBoards(format: string): TeamBoard[] {
  return buildTeamMatchBoards(format).filter((b) => b.requiredAtInitialOrder);
}

export function needsFifthBoardInTLeague(params: {
  team1WinsAfterBoard4: number;
  team2WinsAfterBoard4: number;
}) {
  const { team1WinsAfterBoard4, team2WinsAfterBoard4 } = params;
  return team1WinsAfterBoard4 === 2 && team2WinsAfterBoard4 === 2;
}
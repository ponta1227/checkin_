import { NextResponse } from "next/server";
import { sendSlackNotification } from "@/lib/slack";

export async function GET() {
  try {
    await sendSlackNotification("【テスト通知】Slack連携のテストです。");
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Slackテスト通知に失敗しました。";
    return new NextResponse(message, { status: 500 });
  }
}
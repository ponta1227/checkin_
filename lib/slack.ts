export async function sendSlackNotification(message: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  console.log("SLACK_WEBHOOK_URL exists:", !!webhookUrl);

  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL is not set.");
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack通知に失敗しました: ${res.status} ${text}`);
  }
}
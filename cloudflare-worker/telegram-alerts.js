/**
 * Cloudflare Worker: Better Stack → Telegram Alerts
 *
 * Receives webhook POST from Better Stack, sends Telegram notification.
 *
 * Secrets (set via Cloudflare Dashboard → Worker → Settings → Variables):
 *   TELEGRAM_BOT_TOKEN  — bot token (e.g. 8793664208:AAEh...)
 *   TELEGRAM_CHAT_ID    — target chat ID (e.g. 153715371)
 *
 * Webhook URL to add in Better Stack monitor:
 *   https://betterstack-alerts.<YOUR-NAME>.workers.dev
 */

const STATUS_EMOJI = {
  down: "🔴",
  up: "🟢",
  paused: "⏸",
  pending: "🟡",
};

// Maps keywords in monitor name/url → project name
const MONITOR_MATCH = [
  { project: "Sewing-ERP",    keywords: ["8001", "sewing"] },
  { project: "mankassa-app",  keywords: ["8004", "mankassa"] },
  { project: "Beer_bot",      keywords: ["8003", "beer"] },
  { project: "Uchet_bot",     keywords: ["8002", "uchet"] },
  { project: "solotax-kg",    keywords: ["solotax"] },
  { project: "Business-News", keywords: ["8000", "biznews", "content"] },
  { project: "moliyakg",      keywords: ["moliya", "8005"] },
  { project: "MyMoney",       keywords: ["3010", "mymoney"] },
];

function resolveProject(nameOrUrl) {
  const haystack = (nameOrUrl || "").toLowerCase();
  const match = MONITOR_MATCH.find((m) =>
    m.keywords.some((kw) => haystack.includes(kw.toLowerCase()))
  );
  return match ? match.project : nameOrUrl;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const rawName = body.monitor?.pronounceable_name || body.monitor?.url || "Unknown monitor";
    const monitorName = resolveProject(rawName);
    const cause = body.cause || "";
    const startedAt = body.started_at
      ? new Date(body.started_at).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" })
      : "";

    let text;
    if (body.call_type === "alert") {
      text =
        `${STATUS_EMOJI.down} *DOWN: ${monitorName}*\n` +
        (cause ? `Причина: ${cause}\n` : "") +
        (startedAt ? `Время: ${startedAt}` : "");
    } else if (body.call_type === "recovery") {
      const duration = body.duration ? ` (${Math.round(body.duration / 60)}м)` : "";
      text =
        `${STATUS_EMOJI.up} *RECOVERED: ${monitorName}*${duration}\n` +
        (startedAt ? `Восстановлен: ${startedAt}` : "");
    } else {
      // Generic notification
      text = `ℹ️ *${monitorName}*\n${JSON.stringify(body, null, 2).slice(0, 300)}`;
    }

    const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgResp = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!tgResp.ok) {
      const err = await tgResp.text();
      return new Response(`Telegram error: ${err}`, { status: 502 });
    }

    return new Response("OK", { status: 200 });
  },
};

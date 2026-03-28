/**
 * Cloudflare Worker — Better Stack API proxy
 *
 * Решает CORS-проблему: браузер не может напрямую вызвать uptime.betterstack.com.
 * Воркер хранит токен как секрет (не виден в коде), добавляет CORS-заголовки.
 *
 * Деплой:
 * 1. Зайди на https://workers.cloudflare.com → Create Worker
 * 2. Вставь этот код
 * 3. Settings → Variables → Add variable:
 *    BETTERSTACK_TOKEN = <твой API токен из Better Stack>  (включи "Encrypt")
 * 4. Сохрани и задеплой
 * 5. Скопируй URL воркера (вида https://betterstack-proxy.XXX.workers.dev)
 * 6. Вставь его в дашборд → вкладка Мониторинг
 */

const BETTERSTACK_URL = "https://uptime.betterstack.com/api/v2/monitors";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (!env.BETTERSTACK_TOKEN) {
      return new Response(
        JSON.stringify({ error: "BETTERSTACK_TOKEN secret not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const upstream = await fetch(BETTERSTACK_URL, {
      headers: {
        Authorization: `Bearer ${env.BETTERSTACK_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "max-age=60",
      },
    });
  },
};

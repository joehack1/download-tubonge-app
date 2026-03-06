const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function loadStats(env) {
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS downloadCount FROM download_events",
  ).first();

  const recentRows = await env.DB.prepare(
    "SELECT id, created_at AS timestamp FROM download_events ORDER BY id DESC LIMIT 8",
  ).all();

  return {
    downloadCount: Number(countRow?.downloadCount || 0),
    recentDownloads: recentRows.results || [],
  };
}

async function handleStats(env) {
  return json(await loadStats(env));
}

async function handleDownload(env) {
  const timestamp = new Date().toISOString();

  await env.DB.prepare("INSERT INTO download_events (created_at) VALUES (?)")
    .bind(timestamp)
    .run();

  return json(await loadStats(env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      return handleStats(env);
    }

    if (request.method === "POST" && url.pathname === "/api/downloads") {
      return handleDownload(env);
    }

    return json({ error: "Not found." }, 404);
  },
};

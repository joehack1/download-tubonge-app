const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "site-data.json");
const MAX_BODY_SIZE = 16 * 1024;

const STATIC_ROUTES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/thank-you.html", "thank-you.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/logo2.png", "logo2.png"],
  ["/tubonge.apk", "tubonge.apk"],
]);

let writeQueue = Promise.resolve();

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".apk":
      return "application/vnd.android.package-archive";
    default:
      return "application/octet-stream";
  }
}

function normalizeStore(store) {
  return {
    downloads: Array.isArray(store?.downloads) ? store.downloads : [],
    ratings: Array.isArray(store?.ratings) ? store.ratings : [],
  };
}

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });

  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, JSON.stringify({ downloads: [], ratings: [] }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fsp.readFile(DATA_FILE, "utf8");

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { downloads: [], ratings: [] };
  }
}

async function writeStore(store) {
  await ensureDataFile();
  await fsp.writeFile(DATA_FILE, JSON.stringify(normalizeStore(store), null, 2));
}

async function withStoreLock(mutator) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });

  writeQueue = operation.catch(() => {});
  return operation;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function summarizeStore(store) {
  const ratings = [...store.ratings].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recentRatings = ratings.slice(0, 6);
  const recentDownloads = [...store.downloads]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  const ratingCount = ratings.length;
  const ratingTotal = ratings.reduce((sum, entry) => sum + Number(entry.stars || 0), 0);
  const averageRating = ratingCount ? Number((ratingTotal / ratingCount).toFixed(1)) : 0;

  return {
    downloadCount: store.downloads.length,
    ratingCount,
    averageRating,
    recentDownloads,
    recentRatings,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

async function serveFile(response, filePath, extraHeaders = {}) {
  try {
    const stats = await fsp.stat(filePath);
    response.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Content-Length": stats.size,
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function handleStats(response) {
  const store = await readStore();
  sendJson(response, 200, summarizeStore(store));
}

async function handleRating(request, response) {
  const rawBody = await readRequestBody(request);
  let payload;

  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(response, 400, { error: "Invalid JSON payload." });
    return;
  }

  const stars = Number(payload.stars);
  const name = sanitizeText(payload.name, 40);
  const comment = sanitizeText(payload.comment, 240);

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    sendJson(response, 400, { error: "Rating must be between 1 and 5." });
    return;
  }

  await withStoreLock((store) => {
    store.ratings.push({
      id: randomUUID(),
      name,
      comment,
      stars,
      timestamp: new Date().toISOString(),
    });
  });

  sendJson(response, 201, { ok: true });
}

async function handleDownload(response) {
  const apkPath = path.join(ROOT_DIR, "tubonge.apk");

  await withStoreLock((store) => {
    store.downloads.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    });
  });

  await serveFile(response, apkPath, {
    "Content-Disposition": 'attachment; filename="tubonge.apk"',
    "Cache-Control": "no-store",
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/stats") {
      await handleStats(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/ratings") {
      await handleRating(request, response);
      return;
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/download/tubonge.apk" || url.pathname === "/tubonge.apk")
    ) {
      await handleDownload(response);
      return;
    }

    if (request.method === "GET" && STATIC_ROUTES.has(url.pathname)) {
      const filePath = path.join(ROOT_DIR, STATIC_ROUTES.get(url.pathname));
      await serveFile(response, filePath);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    console.error(error);
    sendText(response, 500, "Internal server error");
  }
});

server.listen(PORT, async () => {
  await ensureDataFile();
  console.log(`Tubonge site running at http://localhost:${PORT}`);
});

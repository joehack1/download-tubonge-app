const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "site-data.json");

const STATIC_ROUTES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/thank-you.html", "thank-you.html"],
  ["/styles.css", "styles.css"],
  ["/counter-config.js", "counter-config.js"],
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
  };
}

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });

  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, JSON.stringify({ downloads: [] }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fsp.readFile(DATA_FILE, "utf8");

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { downloads: [] };
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

function summarizeStore(store) {
  const recentDownloads = [...store.downloads]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  return {
    downloadCount: store.downloads.length,
    recentDownloads,
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

const downloadButton = document.getElementById("dlBtn");
const LOCAL_STORE_KEY = "tubonge-site-data";
const REMOTE_API_BASE = normalizeApiBase(window.TUBONGE_COUNTER_CONFIG?.apiBaseUrl || "");

let counterMode = "unknown";

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveRelativeUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString();
}

function resolveApiUrl(pathname, apiBase = "") {
  const cleanPath = String(pathname).replace(/^\/+/, "");
  return apiBase ? `${apiBase}/${cleanPath}` : resolveRelativeUrl(cleanPath);
}

function normalizeStore(store = {}) {
  return {
    downloads: Array.isArray(store.downloads) ? store.downloads : [],
  };
}

function normalizeStats(stats = {}) {
  return {
    downloadCount: Number(stats.downloadCount || 0),
    recentDownloads: Array.isArray(stats.recentDownloads) ? stats.recentDownloads : [],
  };
}

function readLocalStore() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    return normalizeStore(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeStore();
  }
}

function writeLocalStore(store) {
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(normalizeStore(store)));
    return true;
  } catch {
    return false;
  }
}

function createEntryId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function summarizeStore(store) {
  const normalizedStore = normalizeStore(store);
  const recentDownloads = [...normalizedStore.downloads]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  return {
    downloadCount: normalizedStore.downloads.length,
    recentDownloads,
  };
}

function recordDownloadLocally() {
  const store = readLocalStore();

  store.downloads.push({
    id: createEntryId("download"),
    timestamp: new Date().toISOString(),
  });

  if (!writeLocalStore(store)) {
    return null;
  }

  return summarizeStore(store);
}

function setTextForAll(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createEmptyState(message) {
  const item = document.createElement("li");
  item.className = "empty-state";
  item.textContent = message;
  return item;
}

function renderDownloads(entries) {
  document.querySelectorAll("[data-download-list]").forEach((list) => {
    list.innerHTML = "";

    if (!entries.length) {
      list.appendChild(createEmptyState("No downloads recorded yet."));
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "activity-item";

      const title = document.createElement("span");
      title.className = "activity-title";
      title.textContent = "APK download recorded";

      const meta = document.createElement("span");
      meta.className = "activity-meta";
      meta.textContent = formatDateTime(entry.timestamp);

      item.append(title, meta);
      list.appendChild(item);
    });
  });
}

function renderStats(stats) {
  const normalizedStats = normalizeStats(stats);
  const downloadsLabel = `${normalizedStats.downloadCount} total`;

  setTextForAll("[data-download-count]", String(normalizedStats.downloadCount));

  document.querySelectorAll(".pill[data-download-count]").forEach((node) => {
    node.textContent = downloadsLabel;
  });

  renderDownloads(normalizedStats.recentDownloads);
}

function isJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!isJsonResponse(response)) {
    const error = new Error("Counter API returned a non-JSON response.");
    error.code = "NON_JSON_RESPONSE";
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.error || "Counter request failed.");
    error.code = "API_ERROR";
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadRemoteStats(apiBase) {
  return normalizeStats(
    await requestJson(resolveApiUrl("api/stats", apiBase), {
      headers: { Accept: "application/json" },
    }),
  );
}

async function recordRemoteDownload(apiBase) {
  return normalizeStats(
    await requestJson(resolveApiUrl("api/downloads", apiBase), {
      method: "POST",
      headers: { Accept: "application/json" },
      keepalive: true,
    }),
  );
}

function renderLocalStats() {
  counterMode = "local";
  renderStats(summarizeStore(readLocalStore()));
}

async function loadStats() {
  if (REMOTE_API_BASE) {
    try {
      const stats = await loadRemoteStats(REMOTE_API_BASE);
      counterMode = "remote";
      renderStats(stats);
      return;
    } catch (error) {
      console.warn("Remote counter API unavailable, falling back.", error);
    }
  }

  try {
    const stats = await loadRemoteStats("");
    counterMode = "server";
    renderStats(stats);
  } catch {
    renderLocalStats();
  }
}

function setUpDownloadRedirect() {
  if (!downloadButton) {
    return;
  }

  downloadButton.addEventListener("click", () => {
    downloadButton.classList.add("is-busy");

    if (counterMode === "remote" && REMOTE_API_BASE) {
      void recordRemoteDownload(REMOTE_API_BASE)
        .then((stats) => {
          renderStats(stats);
        })
        .catch((error) => {
          console.warn("Remote download counter failed, falling back locally.", error);
          const stats = recordDownloadLocally();

          if (stats) {
            renderStats(stats);
          }
        });
    } else if (counterMode === "local" || !counterMode || counterMode === "unknown") {
      const stats = recordDownloadLocally();

      if (stats) {
        renderStats(stats);
      }
    }

    window.setTimeout(() => {
      window.location.assign(resolveRelativeUrl("thank-you.html"));
    }, 900);
  });
}

setUpDownloadRedirect();
void loadStats();

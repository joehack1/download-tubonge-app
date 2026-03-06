const downloadButton = document.getElementById("dlBtn");
const LOCAL_STORE_KEY = "tubonge-site-data";

function resolveRelativeUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString();
}

function normalizeStore(store = {}) {
  return {
    downloads: Array.isArray(store.downloads) ? store.downloads : [],
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
  const downloadsLabel = `${stats.downloadCount} total`;

  setTextForAll("[data-download-count]", String(stats.downloadCount));

  document.querySelectorAll(".pill[data-download-count]").forEach((node) => {
    node.textContent = downloadsLabel;
  });

  renderDownloads(stats.recentDownloads || []);
}

function loadStats() {
  renderStats(summarizeStore(readLocalStore()));
}

function setUpDownloadRedirect() {
  if (!downloadButton) {
    return;
  }

  downloadButton.addEventListener("click", () => {
    downloadButton.classList.add("is-busy");

    const stats = recordDownloadLocally();

    if (stats) {
      renderStats(stats);
    }

    window.setTimeout(() => {
      window.location.assign(resolveRelativeUrl("thank-you.html"));
    }, 900);
  });
}

setUpDownloadRedirect();
loadStats();

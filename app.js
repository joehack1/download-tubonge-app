const downloadButton = document.getElementById("dlBtn");
const ratingForm = document.getElementById("ratingForm");
const ratingStatus = document.getElementById("ratingStatus");

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

function formatRatingValue(value) {
  if (!value) {
    return "0.0";
  }

  return Number(value).toFixed(1);
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

function renderRatings(entries) {
  document.querySelectorAll("[data-rating-list]").forEach((list) => {
    list.innerHTML = "";

    if (!entries.length) {
      list.appendChild(createEmptyState("No ratings submitted yet."));
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "review-item";

      const header = document.createElement("div");
      header.className = "review-header";

      const name = document.createElement("span");
      name.className = "review-name";
      name.textContent = entry.name || "Anonymous";

      const stars = document.createElement("span");
      stars.className = "review-stars";
      stars.textContent = `${entry.stars}/5`;

      const meta = document.createElement("span");
      meta.className = "review-meta";
      meta.textContent = formatDateTime(entry.timestamp);

      header.append(name, stars);
      item.append(header, meta);

      if (entry.comment) {
        const comment = document.createElement("p");
        comment.className = "review-comment";
        comment.textContent = entry.comment;
        item.appendChild(comment);
      }

      list.appendChild(item);
    });
  });
}

async function loadStats() {
  try {
    const response = await fetch("/api/stats", { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error("Could not load stats.");
    }

    const stats = await response.json();
    const average = formatRatingValue(stats.averageRating);
    const downloadsLabel = `${stats.downloadCount} total`;
    const summary = stats.ratingCount
      ? `${stats.ratingCount} rating${stats.ratingCount === 1 ? "" : "s"} submitted so far.`
      : "Be the first person to rate Tubonge.";

    setTextForAll("[data-download-count]", String(stats.downloadCount));
    setTextForAll("[data-rating-count]", String(stats.ratingCount));
    setTextForAll("[data-average-rating]", average);
    setTextForAll("[data-rating-summary]", summary);

    document.querySelectorAll(".pill[data-download-count]").forEach((node) => {
      node.textContent = downloadsLabel;
    });

    renderDownloads(stats.recentDownloads || []);
    renderRatings(stats.recentRatings || []);
  } catch (error) {
    renderDownloads([]);
    renderRatings([]);
    setTextForAll("[data-rating-summary]", "Live stats are unavailable right now.");
  }
}

function setRatingMessage(message, type = "") {
  if (!ratingStatus) {
    return;
  }

  ratingStatus.textContent = message;
  ratingStatus.className = "form-status";

  if (type) {
    ratingStatus.classList.add(type);
  }
}

async function submitRating(event) {
  event.preventDefault();

  if (!ratingForm) {
    return;
  }

  const formData = new FormData(ratingForm);
  const stars = Number(formData.get("stars"));
  const name = String(formData.get("name") || "").trim();
  const comment = String(formData.get("comment") || "").trim();

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    setRatingMessage("Choose a rating from 1 to 5.", "is-error");
    return;
  }

  setRatingMessage("Saving rating...");

  try {
    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ stars, name, comment }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not save rating.");
    }

    ratingForm.reset();
    setRatingMessage("Rating saved.", "is-success");
    await loadStats();
  } catch (error) {
    setRatingMessage(error.message, "is-error");
  }
}

function setUpDownloadRedirect() {
  if (!downloadButton) {
    return;
  }

  downloadButton.addEventListener("click", () => {
    downloadButton.classList.add("is-busy");

    window.setTimeout(() => {
      window.location.assign("/thank-you.html");
    }, 900);
  });
}

if (ratingForm) {
  ratingForm.addEventListener("submit", submitRating);
}

setUpDownloadRedirect();
loadStats();

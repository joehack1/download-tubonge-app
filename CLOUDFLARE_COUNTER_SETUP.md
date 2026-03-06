# Cloudflare Counter Setup

This repo includes a Cloudflare Worker + D1 counter in [counter-api/wrangler.toml](/counter-api/wrangler.toml) and [counter-api/src/index.mjs](/counter-api/src/index.mjs).

## 1. Create the D1 database

Run these commands from [counter-api](/counter-api):

```powershell
npx wrangler login
npx wrangler d1 create tubonge-download-counter
```

Cloudflare will print a `database_id`. Copy that value into [counter-api/wrangler.toml](/counter-api/wrangler.toml) and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

## 2. Create the table

```powershell
npx wrangler d1 execute tubonge-download-counter --remote --file schema.sql
```

## 3. Deploy the Worker

```powershell
npx wrangler deploy
```

After deploy, Cloudflare will print a Worker URL similar to:

```text
https://tubonge-download-counter.<your-subdomain>.workers.dev
```

## 4. Point the site at the global counter

Open [counter-config.js](/counter-config.js) and set:

```js
window.TUBONGE_COUNTER_CONFIG = {
  apiBaseUrl: "https://tubonge-download-counter.<your-subdomain>.workers.dev",
};
```

Then push [counter-config.js](/counter-config.js), [index.html](/index.html), [thank-you.html](/thank-you.html), and [app.js](/app.js) to GitHub Pages.

## Notes

- `GET /api/stats` returns the shared global count and the latest eight download timestamps.
- `POST /api/downloads` records one global download click and returns updated stats.
- GitHub Pages still serves the APK file; the Worker only stores the shared counter.
- Anyone can hit a public counter endpoint, so this counts button presses, not guaranteed completed installs.

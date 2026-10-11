# KontentOS — Real Multi-Platform Publishing Plan

> Status: **planned for the testing phase.** Today the calendar + "Publish now" are a
> scheduling/records backbone with **simulated** publishing. This document captures the
> gap analysis, the real mechanism, and the step-by-step path to genuine direct posting —
> so the team can act on it during testing without re-deriving the research.

---

## 1. What exists today (verified in code)

`KontentOS-main/server/routes/publish.ts` (imported read-only by the standalone redesign):

| Endpoint | Actual behaviour | Real platform call? |
| --- | --- | --- |
| `GET /api/publish/status` | Returns `{ standalone: true, "no OAuth required" }` | ❌ |
| `POST /api/publish/schedule` | Writes `scheduled_posts` rows (`status:'scheduled'`, `scheduled_at`, platform, caption, cross-post group, stagger) | ❌ (records only) |
| `POST /api/publish/schedule/:id/publish-now` | Flips row to `published`, mints a **fake** `platform_post_id: live_<uuid>` + `post_url: https://kontentos.ai/posts/<id>` | ❌ (simulated) |
| `POST /api/publish/reels` (`/instagram`, `/save`) | Records a `saved` history row with a **fabricated** `instagram.com/reel/<id>` URL | ❌ (simulated) |

**There is no scheduler/worker.** Grep of the source shows the only `setInterval`/`cron`
matches are inside `node_modules`. A post due at 10:15 tomorrow stays `scheduled` forever
until something fires it.

**Data model is already correct** for real publishing: `scheduled_posts` (per-platform rows,
`cross_post_group_id`, `status`, `scheduled_at`, `published_at`, `post_url`), `publishing_history`.

---

## 2. Target architecture for true direct posting

```
[Upload → clip]  →  [Connect accounts (OAuth, stored tokens)]
                          │
[Schedule]  →  scheduled_posts(status='scheduled', scheduled_at)
                          │
        ┌─────────────────▼──────────────────┐
        │  PUBLISH WORKER (cron / queue)     │  every N sec:
        │  WHERE status='scheduled'          │  due? → dispatch
        │        AND scheduled_at <= now     │
        └─────────────────┬──────────────────┘
                          │  per-platform ADAPTER
        ┌──────┬──────┬───────┬─────────┬──────────┐
        IG     FB   Threads  LinkedIn   YouTube   (official APIs)
        └──────┴──────┴───────┴─────────┴──────────┘
                          │
             update row → published | failed (+ real post id/url)
```

Four things must be added:

1. **OAuth connect + token vault** — one-time per-account "Connect", encrypted access/refresh
   token storage, refresh-on-expiry.
2. **Per-platform adapters** — one module each, same interface `publish(post) → {id,url}`.
3. **A publish worker** — cron tick or queue (e.g. BullMQ/cron) that scans due posts and calls
   the adapter, writing back `published`/`failed` with the **real** id + url. This is what makes
   it "hands-off / without interference".
4. **Publicly reachable media URLs** — IG/Threads/YouTube **fetch** the file from a URL their
   servers can reach. `localhost/uploads` will not work; needs a public bucket/CDN URL.

---

## 3. Platform-by-platform requirements

| Platform | Official API | Account requirement | Publishing flow | Gotchas |
| --- | --- | --- | --- | --- |
| **Instagram** | Instagram Graph API (via Meta) | **Business/Creator** account linked to a FB Page (personal NOT supported) | Create media container → publish container (Reels) | Media must be a **public URL**; App Review for `instagram_content_publish`; rate limits |
| **Facebook** | Graph API Pages | You must manage the Page (perms) | Page video/photo publish | Page token scopes; review for advanced access |
| **Threads** | Threads API (Meta) | Threads account | Publish endpoint (text + media) | Newer API; caps & review |
| **LinkedIn** | UGC Posts + Videos API | Member w/ `w_member_social` | Upload video asset → create UGC post | Stricter app review; some products gated |
| **YouTube** | Data API v3 `videos.insert` | Google account OAuth | Direct multipart upload | Default quota **1,600 units/day**; an upload costs **1,600** → **~1 video/day** unless quota raised; unverified apps upload private pending review |

---

## 4. Platform policy / risk concerns (important)

- **App review / Advanced Access** is required before posting to real third-party accounts on
  Meta (IG/FB/Threads) and for LinkedIn scopes. Until approved, only your own test accounts.
- **Quota/rate limits** — YouTube effectively ~1/day by default; Meta per-user + per-app limits.
  Cross-posting 5 platforms must be **staggered** (schema already supports `staggerMinutes`).
- **No unofficial automation.** Using official APIs to publish your own content is allowed.
  Scraping/logged-in-robot posting violates ToS → account suspension risk.
- **AI-content disclosure & provenance** — Meta + YouTube expect labeling of AI-generated/altered
  media (EU DSA/AI transparency adds obligations). Surface an "AI-modified" flag at publish time
  when GenAI editing materially changed the footage.
- **Failure is async & common** (token expiry, format rejection, dimension/length mismatch) → need
  `failed` status + retry + visible error. Model already has `failed`.

---

## 5. Testing-phase build order (recommended)

- [ ] **Phase A — Manual-assist (no app review needed, ships day 1).** Generate a ready-to-post
      bundle per platform: file + caption + hashtags + a deep link to the platform's upload page.
      User taps to finish posting. Zero API dependency.
- [ ] **Phase B — Worker + first real adapter.** Stand up the cron/queue worker; implement
      **YouTube** first (simplest direct upload) behind a "Connect YouTube" OAuth flow.
- [ ] **Phase C — Meta trio.** IG + FB + Threads containers after App Review; public CDN for media.
- [ ] **Phase D — LinkedIn.** UGC Posts + video upload once scope approved.
- [ ] **Phase E — Hardening.** Retries/backoff, per-platform status surfaced in Calendar,
      AI-disclosure labels, quota dashboards, webhook/poll reconciliation of live post metrics.

### Env/config needed to enable real posting
- `GEMINI_API_KEY` (also unlocks real transcription + AI EDL in the editors — currently absent,
  editors fall back to the local deterministic engine).
- Per-platform app credentials + redirect URIs; token encryption secret.
- Public media base URL (CDN/S3-compatible) reachable by each platform.

---

## 6. What the UI already promises vs. delivers

- The Calendar/Home/Publish screens **read and write real `scheduled_posts`** (isolated store) —
  that part is genuinely functional.
- "Publish now" and the platform toggles are, as of now, **simulated** — they will show success
  against the local DB without any post leaving the app. Until Phase B+, either label them
  clearly as "scheduled (draft)" in the UI or wire the manual-assist bundle (Phase A).

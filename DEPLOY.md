# Deploying Club OS to Vercel

The repo is a monorepo now: the Next.js app lives at `apps/dashboard`, not the repo root.
That one fact drives the whole setup below — Vercel must be told where the app is, and the app
won't serve anything until its environment variables are set.

There are two backends to stand up: **Supabase** (database + storage, so the app has data) and
**Vercel** (hosting). Do Supabase first so you have its keys ready for the Vercel step.

---

## 1. Supabase (database + storage)

The app reads/writes a Postgres database and two storage buckets. Both are created by the
migrations already in this repo (`supabase/migrations/`) — you just need to apply them to a
project.

1. Create a Supabase project (or reuse one) at [supabase.com](https://supabase.com).
2. Apply the migrations. Easiest with the Supabase CLI from the repo root:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   (No CLI? Open each file in `supabase/migrations/` in the Supabase SQL Editor, in filename
   order, and run them. The baseline migration creates the `artists`, `artist_photos`, `events`,
   and `posters` tables plus the public `posters` and `artist-photos` storage buckets.)
3. From **Project Settings → API**, copy three values for the Vercel step:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — server-side only)

---

## 2. Vercel (hosting)

1. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   `Blackkweather/autocontentwebapp`.
2. **Set Root Directory to `apps/dashboard`.** This is the critical step. (Framework is
   auto-detected as Next.js; leave Build & Output settings on their defaults — Vercel reads the
   `build` script from `apps/dashboard/package.json` and installs the npm workspaces from the repo
   root automatically.)
3. Add the environment variables (next section) under **Environment Variables**.
4. Click **Deploy**.

> Production branch: this guide assumes you deploy from `main` (the default). The Club OS
> restructure has been merged there.

### Why the Root Directory matters

If you leave Root Directory at the repo root, Vercel looks for `next.config.ts` / `app/` at the
top level, doesn't find them, and the build fails. The build config
(`apps/dashboard/next.config.ts`) already sets `outputFileTracingRoot` to the monorepo root so the
native dependencies (`sharp`, `onnxruntime-node`, `@napi-rs/canvas`) that npm hoists there still
get bundled into the serverless function.

---

## 3. Environment variables

Set these in Vercel (Project → Settings → Environment Variables). The app **returns HTTP 503 for
every request until `ADMIN_USER` and `ADMIN_PASSWORD` are set** — that's the auth gate failing
closed by design, not a broken deploy.

| Variable | Required? | What it's for |
|---|---|---|
| `ADMIN_USER` | **Required** | HTTP Basic Auth username gating the whole app. Pick anything. |
| `ADMIN_PASSWORD` | **Required** | HTTP Basic Auth password. Pick a strong one. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | Supabase project URL (step 1). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | Supabase anon key (step 1). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Supabase service-role key (step 1). Secret. |
| `GROQ_API_KEY` | Strongly recommended | Event copy + the AI photo-identity screening that the auto-sourcing pipeline depends on. Free tier at [groq.com](https://console.groq.com). Without it, auto-sourced photos can't pass verification and events fall to `photo_missing`; manual photo uploads still work. |
| `GROQ_MODEL` | Optional | Defaults to `llama-3.3-70b-versatile`. |
| `REPLICATE_API_TOKEN` | Optional | The "AI Scene" / "AI Lineup" cinematic posters, and HQ background removal. **Not free** (~$0.03–0.04/image). Without it, those features error clearly and background removal falls back to the bundled local model. |
| `SOCIALCRAWL_API_KEY` | Optional | Instagram photo sourcing tier. |
| `SOCIALCRAWL_BASE_URL` | Optional | Defaults to `https://www.socialcrawl.dev`. |
| `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` | Optional | Google Images photo-sourcing tier. |
| `BRAVE_API_KEY` | Optional | Brave Images photo-sourcing tier. |
| `SENTRY_DSN` | Optional | Error alerting for failed generations. Failures always log to Vercel Runtime Logs regardless. |

The minimum for a working login + basic event/poster flow is the five **Required** rows plus
`GROQ_API_KEY`. Everything else adds photo-sourcing reach or the paid AI-scene feature.

---

## 4. First use

After deploying with the required vars set, open the deployment URL. Your browser will show an
HTTP Basic Auth prompt — enter the `ADMIN_USER` / `ADMIN_PASSWORD` you chose. You're in.

## Local development

```bash
npm install
cp apps/dashboard/.env.example apps/dashboard/.env.local   # fill in the same values
npm run dev
```

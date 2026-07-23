# Club OS

The foundation for Club OS — an AI operating system for nightlife. This repo currently ships one
real product, the **AI Flyer Engine**, restructured into a modular monorepo so future modules
(Guest Intelligence, Revenue, Growth, Promoter Intelligence, City Intelligence, AI CEO, and the
planned Video Engine) can plug into the same core without re-architecting what's already working.

This restructuring is deliberately scoped to *architecture only* — no new product modules were
implemented. The Flyer Engine works exactly as it did before the move.

## Layout

```
/apps
  dashboard/        — the Next.js app (routing, auth, API routes). Business logic lives in
                       modules, not here.
/modules
  flyer-engine/      — AI Flyer Engine: sources a real artist photo, composites it into a
                       branded poster (or an AI-generated cinematic scene).
  video-engine/      — scaffold only, not implemented. See modules/video-engine/README.md.
/packages
  core/              — shared services every module depends on: database (Supabase client),
                       AI providers (Groq chat, Replicate), media processing (background
                       removal), artist/media search (Google/Brave/Deezer/SocialCrawl), and
                       observability (Sentry). No module-specific business logic lives here.
/supabase
  migrations/        — shared database schema, applies across all modules.
```

## Why this split

- **`packages/core` has no domain knowledge.** It knows how to talk to Supabase, Groq, Replicate,
  and image-search providers — not what a "poster" or a "guest" is. Any future module (Video
  Engine, Guest Intelligence, ...) reuses these instead of standing up its own Supabase client or
  Groq wrapper.
- **`modules/flyer-engine` owns the poster domain.** Its own DB row types (`ArtistRow`,
  `EventRow`, `PosterRow`), its brand-voice prompts (event copy, scene-prompt enhancement), the
  poster-quality photo-screening logic, and the canvas rendering pipeline all live here — none of
  it leaked into `core`.
- **`apps/dashboard` only does routing/auth/API glue.** Its route handlers call into
  `@club-os/flyer-engine` and `@club-os/core`; they don't contain business logic themselves.
- Each module is a separate npm workspace with its own `package.json` — a new module (Video
  Engine, Guest Intelligence, ...) is a new folder under `modules/` or `packages/` that depends on
  `@club-os/core`, without touching the Flyer Engine or the dashboard app.

## Getting started

```bash
npm install
npm run dev      # runs apps/dashboard
npm run build    # builds apps/dashboard
npm run test     # runs tests in every workspace that has them (packages/core, modules/flyer-engine)
npm run lint     # lints apps/dashboard
```

Environment variables live in `apps/dashboard/.env.example` — copy it to `apps/dashboard/.env.local`.

## Deploying

**If this repo is already connected to a hosting project (e.g. Vercel) pointed at the repo
root, that connection needs its Root Directory setting updated to `apps/dashboard`** now that the
Next.js app lives there instead of at the repo root — this is a dashboard/project setting, not
something a repo change can update on its own. See `apps/dashboard/README.md` for details.

## What's not here yet

The Video Engine is scaffolded (`modules/video-engine`) but not implemented — no existing Video
Engine codebase was found under this account while this restructuring was done. Guest
Intelligence, Revenue Engine, Growth Engine, Promoter Intelligence, City Intelligence, and AI CEO
are not started. This restructuring is meant to make adding each of those additive: a new
workspace under `modules/` (or `packages/` if it's shared infra), depending on `@club-os/core`.

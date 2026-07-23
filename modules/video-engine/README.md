# @club-os/video-engine

Not implemented. This package is a scaffold, not a working module.

No existing "Video Engine" codebase was found in this GitHub account while setting up this
monorepo — only the AI Flyer Engine (now `@club-os/flyer-engine`) existed as real code. If the
Video Engine lives somewhere else (a different account, a local-only project, not yet on GitHub),
point Claude at it and it can be imported into `src/` here.

## Shape to preserve when the real code lands

- Depend on `@club-os/core` for database, AI providers, media processing, artist/media search,
  and observability — the same shared services `@club-os/flyer-engine` uses. Don't duplicate
  a second Supabase client, a second Groq/Replicate wrapper, etc.
- Expose its public API through `package.json`'s `exports` map (see
  `@club-os/flyer-engine/package.json` for the pattern), so `apps/dashboard` imports
  `@club-os/video-engine`, never `@club-os/video-engine/src/whatever-internal-file`.
- Keep video-domain business logic (rendering, prompt templates, its own DB row types) inside
  this module, not in `@club-os/core` — mirror the `flyer-engine` vs. `core` split documented in
  the root `README.md`.

// Placeholder — the real Video Engine hasn't been imported into this repo yet (no existing
// Video Engine codebase was found under this account at the time this scaffold was created).
//
// This module exists so the shape is settled before the code lands: it depends on
// @club-os/core (database, AI providers, media, search, observability) exactly like
// @club-os/flyer-engine does, and apps/dashboard would consume it the same way — via
// `@club-os/video-engine`, never by reaching into @club-os/core internals directly.
//
// Dropping the real engine in means replacing this file's contents (and adding whatever
// submodules it needs under src/), not restructuring this package or any other module.

export const VIDEO_ENGINE_STATUS = "not_implemented" as const;

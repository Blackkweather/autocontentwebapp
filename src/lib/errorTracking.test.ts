import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { captureGenerationFailure } from "./errorTracking";

const initMock = vi.mocked(Sentry.init);
const captureExceptionMock = vi.mocked(Sentry.captureException);
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

const ORIGINAL_DSN = process.env.SENTRY_DSN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SENTRY_DSN;
});

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = ORIGINAL_DSN;
});

describe("captureGenerationFailure", () => {
  it("always logs a structured error, even with no DSN configured", () => {
    captureGenerationFailure(new Error("render exploded"), {
      eventId: "evt-1",
      artistName: "Some Artist",
      stage: "generation",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[poster-generation-failed]",
      expect.stringContaining("render exploded")
    );
  });

  it("never calls Sentry when SENTRY_DSN is unset — true no-op, not just uninitialized", () => {
    captureGenerationFailure(new Error("boom"), { eventId: "evt-1", artistName: "X", stage: "generation" });

    expect(initMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("initializes and reports to Sentry once a DSN is configured, with the right context", () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";

    const error = new Error("upload failed");
    captureGenerationFailure(error, { eventId: "evt-2", artistName: "Booba", stage: "generation", variant: "flyer" });

    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://example@sentry.io/1" }));
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { eventId: "evt-2", stage: "generation" },
        extra: { artistName: "Booba", variant: "flyer" },
      })
    );
  });

  it("handles non-Error throwables without crashing", () => {
    expect(() =>
      captureGenerationFailure("a plain string throw", { eventId: "evt-3", artistName: "X", stage: "claim" })
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith("[poster-generation-failed]", expect.stringContaining("a plain string throw"));
  });
});

/**
 * An error whose message is written for the person who triggered it.
 *
 * This exists because of how Next handles a Server Action that throws in
 * production: the message is replaced with a generic "An error occurred in the
 * Server Components render… a digest property is included", so that every
 * carefully-worded, actionable message written in an action is invisible exactly
 * where it matters most. A dead Google token surfaced to the owner as an opaque
 * digest instead of "reconnect Google in Settings" — a five-second fix presented
 * as an unexplained failure.
 *
 * So expected failures are marked with this class and **returned as data** rather
 * than thrown. Anything not marked is a bug rather than a condition, and is left
 * to throw: it belongs in the server log, not in a toast.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export type ActionResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

/**
 * Run an action body, turning expected failures into a result the UI can show.
 *
 * `instanceof` is unreliable across a bundler boundary, so the name is checked too.
 */
export async function asResult<T extends object>(
  fn: () => Promise<T>,
  fallback: string
): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    const expected =
      err instanceof UserFacingError ||
      (err instanceof Error && err.name === "UserFacingError");
    if (expected) return { ok: false, message: (err as Error).message };

    // Unexpected: keep it in the logs where it can be diagnosed, and tell the
    // person something true without inventing a cause.
    console.error("[action] unexpected failure:", err);
    return { ok: false, message: fallback };
  }
}

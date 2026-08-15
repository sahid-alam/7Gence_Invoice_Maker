/**
 * This app's own base URL, and the OAuth redirect built from it.
 *
 * `NEXT_PUBLIC_APP_URL` is typed by hand into a dashboard, and writing a URL with a
 * trailing slash is the natural thing to do. Interpolated straight into a path that
 * already begins with "/", it yields `https://host//api/oauth/google/callback` —
 * which Google compares character-for-character against the registered redirect URI
 * and rejects as `redirect_uri_mismatch`. The reconnect then fails for a reason the
 * error message does not explain.
 *
 * Shared rather than repeated because the authorize step and the token exchange must
 * send a byte-identical `redirect_uri`. Two copies of the same regex are two chances
 * for them to drift apart, and the failure only shows up at the end of the flow.
 */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/oauth/google/callback`;
}

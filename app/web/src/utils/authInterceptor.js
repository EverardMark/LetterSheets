// Global session-expiry handler.
//
// Every page has its own tiny `api()` helper that fetches /api/execute and
// swallows errors, so an expired/invalid session token (HTTP 401) would leave a
// page silently showing empty data instead of sending the user back to sign in.
// (ERPLayout only gates on the company key in sessionStorage, not on the token's
// validity.) Rather than patch ~30 duplicated helpers, we wrap fetch once here.
//
// Scope is tight: only responses to /api/execute on an *authenticated* request
// (one that carried a session token) are acted on. Pre-auth calls — login /
// select_company run before ls_session exists — pass through untouched, so the
// login page keeps showing "invalid credentials" normally.

let redirecting = false;

export function installAuthInterceptor() {
  if (typeof window === "undefined" || window.__lsAuthPatched) return;
  window.__lsAuthPatched = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const isApi = url.includes("/api/execute");
      const wasAuthed = !!localStorage.getItem("ls_session");

      if (res.status === 401 && isApi && wasAuthed) {
        // One retry absorbs a transient blip at mount. API bodies are JSON
        // strings, so re-sending the same init is safe.
        const retry = await origFetch(input, init);
        if (retry.status !== 401) return retry;

        // Still unauthorized → the session is genuinely gone. Clear it and go to
        // sign in (guard against redirect loops / double fires).
        if (!redirecting) {
          redirecting = true;
          localStorage.removeItem("ls_session");
          localStorage.removeItem("ls_user");
          localStorage.removeItem("ls_company");
          sessionStorage.removeItem("ls_company_key");
          if (window.location.pathname !== "/") window.location.href = "/";
        }
        return retry;
      }
    } catch {
      // The interceptor must never break a request.
    }
    return res;
  };
}

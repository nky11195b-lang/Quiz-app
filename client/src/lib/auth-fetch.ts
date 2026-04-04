/**
 * Transparent fetch wrapper with automatic access-token refresh on 401.
 *
 * Flow:
 *  1. Attach stored access token to every request.
 *  2. If the server returns 401, call POST /api/auth/refresh (refresh token
 *     is sent automatically via the HTTP-only cookie).
 *  3. If refresh succeeds, store the new access token and retry.
 *  4. If refresh fails, fire the global "auth-logout-required" event so the
 *     AuthProvider can clear state and navigate to /auth.
 *
 * Concurrent 401s are queued: only one refresh request is ever in-flight.
 */

export const ACCESS_TOKEN_KEY = "quiznova_token";

let isRefreshing = false;
let pendingCallbacks: Array<(token: string | null) => void> = [];

function onRefreshDone(token: string | null) {
  pendingCallbacks.forEach((cb) => cb(token));
  pendingCallbacks = [];
}

async function doRefresh(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Refresh failed");
    const data = await res.json();
    const newToken: string = data.accessToken;
    localStorage.setItem(ACCESS_TOKEN_KEY, newToken);
    window.dispatchEvent(new CustomEvent("token-refreshed", { detail: newToken }));
    return newToken;
  } catch {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event("auth-logout-required"));
    return null;
  }
}

async function refreshOnce(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => pendingCallbacks.push(resolve));
  }
  isRefreshing = true;
  const token = await doRefresh();
  isRefreshing = false;
  onRefreshDone(token);
  return token;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  // Never retry auth endpoints — avoids infinite loops
  if (res.status === 401 && !url.includes("/api/auth/")) {
    const newToken = await refreshOnce();
    if (newToken) {
      return fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
        credentials: "include",
      });
    }
  }

  return res;
}

"use client";
// WebSetu — frontend API client.
//
// The session lives in an httpOnly cookie the browser attaches on its own, so
// nothing here reads or stores a token any more. It used to keep one in
// localStorage, which meant any script that ran on the page — including an
// injected one — could read a credential valid for thirty days.
//
// `setToken` survives as a no-op shim so callers that still announce a login do
// not have to be rewritten in lockstep; the cookie is what actually carries the
// session either way.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Retained for call sites that used to persist the token. Does nothing now. */
export function setToken(_token: string) {
  /* the session is an httpOnly cookie set by the server */
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    // Send the session cookie. Same-origin only: this app never calls another
    // host, and "include" would attach credentials to a cross-origin request.
    credentials: "same-origin",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  const parsed = body as { ok?: boolean; data?: T; error?: string };
  if (!res.ok || parsed.ok === false) {
    throw new ApiError(parsed.error || `Request failed (${res.status})`, res.status);
  }
  return parsed.data as T;
}

/**
 * Like `request`, but returns the envelope's `meta` as well as its `data`.
 *
 * List endpoints answer `{ ok, data, meta }` where meta carries totals and
 * paging. `request` throws that away, which is fine for the many callers that
 * only want the rows — and useless for a paged table, which needs to know how
 * many pages there are.
 */
async function requestWithMeta<T, M>(path: string, options: RequestInit = {}): Promise<{ data: T; meta: M }> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  const parsed = body as { ok?: boolean; data?: T; meta?: M; error?: string };
  if (!res.ok || parsed.ok === false) {
    throw new ApiError(parsed.error || `Request failed (${res.status})`, res.status);
  }
  return { data: parsed.data as T, meta: (parsed.meta ?? {}) as M };
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  /** GET a list endpoint, keeping its paging metadata. */
  raw: <T, M>(path: string) => requestWithMeta<T, M>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  // FormData upload — must bypass request(), which forces application/json.
  upload: async <T,>(path: string, file: File): Promise<T> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(path, { method: "POST", body: fd, credentials: "same-origin" });
    const parsed = await res.json().catch(() => null);
    if (!res.ok || !parsed || parsed.ok === false) {
      throw new ApiError(parsed?.error || `Upload failed (${res.status})`, res.status);
    }
    return parsed.data as T;
  },
};

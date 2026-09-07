"use client";
// WebSetu — frontend API client (attaches session token)

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "websetu_token";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
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

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  // FormData upload — must bypass request() which forces Content-Type: application/json
  upload: async <T,>(path: string, file: File): Promise<T> => {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    const res = await fetch(path, {
      method: "POST",
      body: fd,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    const parsed = await res.json().catch(() => null);
    if (!res.ok || !parsed || parsed.ok === false) {
      throw new ApiError(parsed?.error || `Upload failed (${res.status})`, res.status);
    }
    return parsed.data as T;
  },
};

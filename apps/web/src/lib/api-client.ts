import { useAuthStore } from "@/store/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3012/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly error: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie (set by the API on its own origin) for a
 * new access token. Coalesced into a single in-flight promise so concurrent 401s
 * don't each fire their own refresh request.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body.data.accessToken as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Internal — prevents infinite retry loops on the refresh call itself. */
  _isRetry?: boolean;
}

/**
 * Converts empty-string values in a flat request body to `undefined` (dropped
 * by JSON.stringify) before it's sent. react-hook-form reports every untouched
 * optional text input as `""`, not `undefined` — but the API's DTOs use
 * `@IsOptional()`, which class-validator only treats as "not provided" for
 * `null`/`undefined`, not `""`. Left unfixed, any optional `@IsEmail()` field
 * (Customer/Supplier email, Factory contact email, …) left blank in a form
 * fails with a 400 ("email must be an email") instead of being omitted — this
 * was caught by an actual headless-browser run of the create-customer flow,
 * not by any static check.
 */
function stripEmptyStrings(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = value === "" ? undefined : value;
  }
  return result;
}

/**
 * Thin fetch wrapper: attaches the in-memory access token, always sends
 * credentials (so the API's httpOnly refresh cookie is included even though
 * the frontend and API are different origins in dev), unwraps the API's
 * `{ data, meta? }` success envelope, and on a 401 makes exactly one attempt to
 * silently refresh and retry before giving up and clearing the session.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: unknown }> {
  const { body, _isRetry, headers, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(stripEmptyStrings(body)) : undefined,
  });

  if (res.status === 401 && !_isRetry && !path.startsWith("/auth/")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken);
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
    useAuthStore.getState().clear();
    throw new ApiError("Session expired", 401, "Unauthorized");
  }

  if (res.status === 204) {
    return { data: undefined as T };
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const errorBody = json as ApiErrorBody | null;
    const message = Array.isArray(errorBody?.message) ? errorBody.message.join(", ") : errorBody?.message;
    throw new ApiError(message ?? "Request failed", res.status, errorBody?.error ?? "Error");
  }

  return json as { data: T; meta?: unknown };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "DELETE" }),
};

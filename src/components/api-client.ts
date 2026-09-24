"use client";

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    current?: unknown;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly current?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message || "请求没有成功，请稍后重试");
    this.name = "ApiError";
    this.status = status;
    this.code = body.error?.code || "REQUEST_FAILED";
    this.fields = body.error?.fields || {};
    this.current = body.error?.current;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") || "";
  if (response.status === 204) return null;
  if (type.includes("application/json")) return response.json();
  return null;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, (body || {}) as ApiErrorBody);
  return body as T;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求没有成功，请稍后重试";
}


import { NextResponse } from "next/server";

import { AppError, appErrorResponse } from "@/lib/errors";
import { requestSourceKey } from "@/lib/security";

export { requestSourceKey };

export function assertJsonMutation(request: Request, configuredOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin !== configuredOrigin) {
    throw new AppError(403, "invalid_origin", "请求来源无效");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new AppError(400, "invalid_content_type", "请求必须使用 JSON 格式");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const maximumBytes = 256 * 1024;
  try {
    if (!request.body) throw new Error("missing body");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError(413, "request_too_large", "请求内容过大");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AppError(400, "invalid_json_object", "请求 JSON 必须是对象");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "invalid_json", "请求 JSON 无法解析");
  }
}

export async function apiRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    const response = await fn();
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const response = appErrorResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

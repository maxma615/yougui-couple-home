import { AppError } from "@/lib/errors";

const MAX_MULTIPART_OVERHEAD = 64 * 1024;

export type ParsedPhotoUpload = {
  filename: string;
  claimedMime: string;
  data: Uint8Array;
  version: number;
};

function uploadTooLarge(maxBytes: number): AppError {
  return new AppError(413, "IMAGE_TOO_LARGE", "照片超过上传大小限制", {
    file: `照片不能超过 ${maxBytes} 字节`,
  });
}

export function assertMultipartMutation(
  request: Request,
  configuredOrigin: string,
  maxBytes: number,
): string {
  if (request.headers.get("origin") !== configuredOrigin) {
    throw new AppError(403, "invalid_origin", "请求来源无效");
  }
  const contentType = request.headers.get("content-type") ?? "";
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})"|([!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}))$/i.exec(
    contentType,
  );
  if (!match) {
    throw new AppError(400, "invalid_content_type", "照片上传必须使用 multipart/form-data");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      throw new AppError(400, "invalid_content_length", "请求长度无效");
    }
    if (declared > maxBytes + MAX_MULTIPART_OVERHEAD) throw uploadTooLarge(maxBytes);
  }
  return match[1] ?? match[2];
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (!request.body) throw new AppError(400, "invalid_multipart", "上传内容为空");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes + MAX_MULTIPART_OVERHEAD) {
        await reader.cancel().catch(() => undefined);
        throw uploadTooLarge(maxBytes);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function invalidMultipart(message = "照片上传格式无法解析"): AppError {
  return new AppError(400, "invalid_multipart", message);
}

function parseHeaders(value: Buffer): Record<string, string> {
  if (value.length > 16 * 1024) throw invalidMultipart();
  const headers: Record<string, string> = {};
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw invalidMultipart("上传文件名必须使用 UTF-8 编码");
  }
  for (const line of decoded.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) throw invalidMultipart();
    const name = line.slice(0, separator).trim().toLowerCase();
    const headerValue = line.slice(separator + 1).trim();
    if (headers[name] !== undefined) throw invalidMultipart();
    headers[name] = headerValue;
  }
  return headers;
}

export async function readPhotoMultipart(
  request: Request,
  boundary: string,
  maxBytes: number,
): Promise<ParsedPhotoUpload> {
  const body = await readBoundedBody(request, maxBytes);
  const delimiter = Buffer.from(`--${boundary}`, "ascii");
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`, "ascii");
  let cursor = 0;
  let file: Omit<ParsedPhotoUpload, "version"> | undefined;
  let version: number | undefined;

  while (true) {
    if (!body.subarray(cursor, cursor + delimiter.length).equals(delimiter)) {
      throw invalidMultipart();
    }
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).toString("ascii") === "--") break;
    if (body.subarray(cursor, cursor + 2).toString("ascii") !== "\r\n") {
      throw invalidMultipart();
    }
    cursor += 2;
    const headerEnd = body.indexOf("\r\n\r\n", cursor, "ascii");
    if (headerEnd < 0) throw invalidMultipart();
    const headers = parseHeaders(body.subarray(cursor, headerEnd));
    const contentStart = headerEnd + 4;
    const contentEnd = body.indexOf(nextDelimiter, contentStart);
    if (contentEnd < 0) throw invalidMultipart();
    const contents = body.subarray(contentStart, contentEnd);
    cursor = contentEnd + 2;

    const disposition = headers["content-disposition"] ?? "";
    if (!/^form-data(?:;|$)/i.test(disposition)) throw invalidMultipart();
    const name = /(?:^|;)\s*name="([^"]+)"/i.exec(disposition)?.[1];
    if (name === "file") {
      const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1];
      const claimedMime = headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
      if (file || filename === undefined || !claimedMime) throw invalidMultipart();
      if (contents.length > maxBytes) throw uploadTooLarge(maxBytes);
      file = { filename, claimedMime, data: contents };
    } else if (name === "version") {
      const raw = contents.toString("utf8");
      if (version !== undefined || !/^[1-9]\d*$/.test(raw)) throw invalidMultipart("版本号无效");
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed)) throw invalidMultipart("版本号无效");
      version = parsed;
    } else {
      throw invalidMultipart("上传只接受 file 和 version 字段");
    }
  }

  if (!file || version === undefined) throw invalidMultipart("请同时提交照片和版本号");
  return { ...file, version };
}

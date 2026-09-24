import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import sharp from "sharp";

import { AppError } from "@/lib/errors";

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ValidatedImage = {
  mime: SupportedImageMime;
  extension: "jpg" | "png" | "webp";
  bytes: number;
  sha256: string;
  width: number;
  height: number;
};

export type ImageValidationOptions = {
  claimedMime: string;
  maxBytes: number;
  maxPixels: number;
};

function sniffImage(bytes: Buffer): Pick<ValidatedImage, "mime" | "extension"> | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return undefined;
}

function invalidImage(): AppError {
  return new AppError(422, "INVALID_IMAGE", "照片无法解码或格式不受支持", {
    file: "请选择完整的 JPEG、PNG 或 WebP 图片",
  });
}

export async function validateImage(
  filePath: string,
  options: ImageValidationOptions,
): Promise<ValidatedImage> {
  const fileStat = await stat(filePath);
  if (fileStat.size === 0) {
    throw new AppError(422, "EMPTY_IMAGE", "照片不能为空", { file: "请选择非空照片" });
  }
  if (fileStat.size > options.maxBytes) {
    throw new AppError(413, "IMAGE_TOO_LARGE", "照片超过上传大小限制", {
      file: `照片不能超过 ${options.maxBytes} 字节`,
    });
  }

  const bytes = await readFile(filePath);
  const detected = sniffImage(bytes);
  if (!detected) throw invalidImage();
  if (options.claimedMime.toLowerCase() !== detected.mime) {
    throw new AppError(422, "IMAGE_TYPE_MISMATCH", "照片类型与实际内容不一致", {
      file: "请保持文件类型与图片内容一致",
    });
  }

  try {
    const image = sharp(bytes, {
      animated: true,
      failOn: "error",
      limitInputPixels: options.maxPixels + 1,
    });
    const metadata = await image.metadata();
    const expectedFormat = detected.extension === "jpg" ? "jpeg" : detected.extension;
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw invalidImage();
    }
    const pages = metadata.pages ?? 1;
    const pageHeight = metadata.pageHeight ?? metadata.height;
    const pixels = metadata.width * pageHeight * pages;
    if (!Number.isSafeInteger(pixels) || pixels > options.maxPixels) {
      throw new AppError(422, "IMAGE_TOO_MANY_PIXELS", "照片像素超过限制", {
        file: `照片总像素不能超过 ${options.maxPixels}`,
      });
    }

    // metadata() can succeed for a truncated JPEG. Force complete pixel decode.
    await image.clone().stats();

    return {
      ...detected,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: metadata.width,
      height: pageHeight,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidImage();
  }
}

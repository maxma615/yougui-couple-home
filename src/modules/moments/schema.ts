import { z } from "zod";

import { localDate, longText, parseFields, title } from "@/lib/validation";

const momentInput = z.object({
  title,
  date: localDate,
  body: longText,
});

export function parseMomentInput(input: unknown): Record<string, unknown> {
  return parseFields(momentInput, input);
}

export type MomentPhoto = {
  id: string;
  filename: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
};


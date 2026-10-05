export type PhotoVariant = "thumbnail" | "preview";

/** Keeps photos on the authenticated application route; callers choose the smallest suitable rendition. */
export function photoUrl(
  photoId: string,
  options: { variant?: PhotoVariant; retry?: number } = {},
): string {
  const query = new URLSearchParams();
  if (options.variant) query.set("variant", options.variant);
  if (options.retry) query.set("retry", String(options.retry));
  const serialized = query.toString();
  const suffix = serialized ? `?${serialized}` : "";
  return `/api/photos/${encodeURIComponent(photoId)}${suffix}`;
}

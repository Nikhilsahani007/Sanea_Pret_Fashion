// Image upload (POST /admin/media): a raw body with the image's own
// Content-Type, the display name in X-Upload-Filename (D-079). XMLHttpRequest
// is used only because fetch cannot report upload progress.
import {
  API_BASE,
  ApiError,
  NETWORK_MESSAGE,
  csrfToken,
  noteFailure,
} from "./client.ts";
import type { MediaAsset } from "./types.ts";

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** The header must be plain ASCII; the API sanitises it again. */
export function uploadName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._ -]/g, "")
      .trim()
      .slice(0, 100) || "image"
  );
}

/** Problems found before sending, with the same wording as the API. */
export function localUploadProblem(file: File): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type))
    return "Upload a JPEG, PNG or WebP image.";
  if (file.size > MAX_UPLOAD_BYTES)
    return "The image is larger than 15 MB. Export a smaller file and try again.";
  return null;
}

export async function uploadImage(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<MediaAsset> {
  const token = await csrfToken();
  return new Promise<MediaAsset>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/admin/media`);
    xhr.withCredentials = false; // same origin: cookies are sent anyway
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-CSRF-Token", token);
    xhr.setRequestHeader("X-Upload-Filename", uploadName(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status === 201) return resolve(body as MediaAsset);
      const e = (body as { error?: Record<string, unknown> } | undefined)
        ?.error;
      const error =
        e && typeof e.code === "string"
          ? new ApiError(
              xhr.status,
              e.code,
              typeof e.message === "string" ? e.message : "The upload failed.",
              e.details,
            )
          : new ApiError(
              xhr.status,
              "UNKNOWN",
              "The upload failed. Try again.",
            );
      noteFailure(error);
      reject(error);
    };
    xhr.send(file);
  });
}

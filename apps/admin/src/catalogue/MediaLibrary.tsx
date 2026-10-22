// Media library: uploaded images, newest first, as derivative thumbnails only
// (GET /admin/media). Alt text is set where an image is used on a product.
import { useState } from "react";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import type { MediaAsset, Page } from "../api/types.ts";
import { bytes, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button } from "../ui/controls.tsx";
import {
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Stack,
} from "../ui/feedback.tsx";
import s from "./catalogue.module.css";

export function MediaLibrary() {
  const first = useResource<Page<MediaAsset>>(
    (signal) => api.get(`/admin/media${query({ limit: 24 })}`, { signal }),
    [],
  );
  const [more, setMore] = useState<MediaAsset[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (first.status === "loading") return <Loading label="Loading images…" />;
  if (first.status === "error")
    return <ErrorState error={first.error} onRetry={first.reload} />;
  const next = cursor === undefined ? first.data.nextCursor : cursor;
  const items = [...first.data.items, ...more];

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api.get<Page<MediaAsset>>(
        `/admin/media${query({ limit: 24, cursor: next })}`,
      );
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Media library"
        description="Every uploaded image, newest first. Upload images from a product's Images section."
      />
      {items.length === 0 ? (
        <Empty>
          <p>No images uploaded yet.</p>
        </Empty>
      ) : (
        <ul className={s.mediaGrid} aria-label="Uploaded images">
          {items.map((a) => {
            const thumb =
              a.derivatives.find(
                (d) => d.format === "webp" && d.width >= 300,
              ) ?? a.derivatives.find((d) => d.format === "webp");
            return (
              <li key={a.id} className={s.mediaItem}>
                {thumb ? (
                  <img
                    src={thumb.url}
                    alt=""
                    width={thumb.width}
                    height={thumb.height}
                    loading="lazy"
                  />
                ) : null}
                <span>
                  {a.width} × {a.height} px · {bytes(a.bytes)}
                </span>
                <span>Uploaded {when(a.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {error ? <Notice tone="error" title={error.message} /> : null}
      {next ? (
        <div>
          <Button
            variant="secondary"
            onClick={loadMore}
            busy={busy}
            busyLabel="Loading…"
          >
            Load more images
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}

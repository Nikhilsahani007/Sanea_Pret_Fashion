// Product images: upload (raw body with progress, D-079), required alt text,
// role and colour, order with move buttons, and removal. Only derivative URLs
// are shown; originals stay private (safeguard 1). Upload refusals use the
// API's own messages: 413, 415, 429 queue full, 503 timeouts (D-088).
import { useState, type FormEvent } from "react";

import {
  api,
  localError,
  toApiError,
  withMessage,
  type ApiError,
} from "../api/client.ts";
import type { ProductDetail, ProductImage } from "../api/types.ts";
import {
  localUploadProblem,
  uploadImage,
  ACCEPTED_TYPES,
} from "../api/upload.ts";
import { useCan } from "../auth/session.tsx";
import { Button, SelectField, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorSummary,
  Notice,
  Panel,
  Stack,
  ui,
} from "../ui/feedback.tsx";
import type { Reference } from "./ProductEditor.tsx";
import s from "./catalogue.module.css";

type Role = ProductImage["role"];
const ROLES: { value: Role; label: string; hint: string }[] = [
  {
    value: "PRIMARY",
    label: "Primary",
    hint: "the main image; one is needed to publish",
  },
  { value: "HOVER", label: "Second view", hint: "shown on hover in listings" },
  {
    value: "GALLERY",
    label: "Gallery",
    hint: "further views on the product page",
  },
];

/** Retry advice for the upload queue's temporary refusals. */
export function uploadAdvice(error: ApiError): string | null {
  if (
    error.code === "UPLOAD_QUEUE_FULL" ||
    error.code === "UPLOAD_QUEUE_TIMEOUT"
  )
    return "Other uploads are being processed. Wait a moment, then try again.";
  if (error.code === "UPLOAD_PROCESSING_TIMEOUT")
    return "Try a smaller image, for example under 4000 pixels on the long side.";
  return null;
}

const thumbOf = (image: {
  sources: ProductImage["sources"];
  url: string | null;
}) =>
  image.sources.find((x) => x.format === "webp" && x.width >= 300)?.url ??
  image.url;

export function ImagesPanel({
  product,
  reference,
  onChange,
}: {
  product: ProductDetail;
  reference: Reference;
  onChange: () => void;
}) {
  const can = useCan();
  const canEdit = can("products.editContent");
  const images = [...product.images].sort((a, b) => a.position - b.position);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      onChange();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  function move(index: number, by: -1 | 1) {
    const order = [...images];
    const [img] = order.splice(index, 1);
    order.splice(index + by, 0, img!);
    void run(
      `move-${img!.id}`,
      async () => {
        for (const [position, image] of order.entries())
          if (image.position !== position)
            await api.patch(
              `/admin/products/${product.id}/images/${image.id}`,
              { position },
            );
      },
      "Image order saved.",
    );
  }

  function remove(image: ProductImage) {
    if (
      !window.confirm(
        `Remove the image “${image.alt}” from this product? The file stays in the media library.`,
      )
    )
      return;
    void run(
      `remove-${image.id}`,
      () => api.delete(`/admin/products/${product.id}/images/${image.id}`),
      "Image removed.",
    );
  }

  const colourName = (id: string | null) =>
    id
      ? (reference.colours.find((c) => c.id === id)?.name ?? "—")
      : "All colours";

  return (
    <Panel title="Images">
      <Stack gap="4">
        {message ? <Notice tone="success" title={message} /> : null}
        {error ? <Notice tone="error" title={error.message} /> : null}
        {images.length === 0 ? (
          <p className={ui.muted}>
            No images yet. A product needs a primary image to be published.
          </p>
        ) : (
          <ol className={s.blocks} aria-label="Product images in display order">
            {images.map((image, i) => (
              <li key={image.id} className={s.imageRow}>
                {thumbOf(image) ? (
                  <img
                    className={s.thumb}
                    src={thumbOf(image)!}
                    alt={image.alt}
                    width={96}
                    height={120}
                    loading="lazy"
                  />
                ) : (
                  <div className={s.thumb} />
                )}
                {canEdit ? (
                  <ImageDetails
                    productId={product.id}
                    image={image}
                    reference={reference}
                    onSaved={() => {
                      setMessage("Image details saved.");
                      onChange();
                    }}
                    actions={
                      <Cluster gap="2">
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={i === 0 || busy !== null}
                          onClick={() => move(i, -1)}
                          aria-label={`Move image ${i + 1} up`}
                        >
                          Move up
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={i === images.length - 1 || busy !== null}
                          onClick={() => move(i, 1)}
                          aria-label={`Move image ${i + 1} down`}
                        >
                          Move down
                        </Button>
                        <Button
                          variant="danger"
                          size="small"
                          busy={busy === `remove-${image.id}`}
                          busyLabel="Removing…"
                          onClick={() => remove(image)}
                          aria-label={`Remove image ${i + 1}`}
                        >
                          Remove
                        </Button>
                      </Cluster>
                    }
                  />
                ) : (
                  <dl>
                    <dt className={ui.hint}>Alt text</dt>
                    <dd>{image.alt}</dd>
                    <dt className={ui.hint}>Role</dt>
                    <dd>{ROLES.find((r) => r.value === image.role)?.label}</dd>
                    <dt className={ui.hint}>Colour</dt>
                    <dd>{colourName(image.colourId)}</dd>
                  </dl>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEdit ? (
          <AddImageForm
            product={product}
            reference={reference}
            nextPosition={
              images.length ? Math.max(...images.map((x) => x.position)) + 1 : 0
            }
            hasPrimary={images.some((x) => x.role === "PRIMARY")}
            onAdded={() => {
              setMessage("Image added.");
              onChange();
            }}
          />
        ) : null}
      </Stack>
    </Panel>
  );
}

function ImageDetails({
  productId,
  image,
  reference,
  onSaved,
  actions,
}: {
  productId: string;
  image: ProductImage;
  reference: Reference;
  onSaved: () => void;
  actions: React.ReactNode;
}) {
  const [alt, setAlt] = useState(image.alt);
  const [role, setRole] = useState<Role>(image.role);
  const [colourId, setColourId] = useState(image.colourId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const changed =
    alt !== image.alt ||
    role !== image.role ||
    colourId !== (image.colourId ?? "");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!alt.trim()) {
      setError(localError("Describe the image for people who cannot see it."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/products/${productId}/images/${image.id}`, {
        alt: alt.trim(),
        role,
        colourId: colourId || null,
      });
      onSaved();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-label={`Image ${image.alt}`}>
      <Stack gap="3">
        <TextField
          label="Alt text"
          value={alt}
          maxLength={200}
          onChange={(e) => setAlt(e.target.value)}
          error={error?.message}
          hint="What the image shows, for example: Rose silk kurta, front view."
        />
        <div className={s.twoColumns}>
          <SelectField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Colour"
            value={colourId}
            onChange={(e) => setColourId(e.target.value)}
            optional
          >
            <option value="">All colours</option>
            {reference.colours.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Cluster gap="2">
          <Button
            type="submit"
            size="small"
            disabled={!changed}
            busy={busy}
            busyLabel="Saving…"
          >
            Save image details
          </Button>
          {actions}
        </Cluster>
      </Stack>
    </form>
  );
}

function AddImageForm({
  product,
  reference,
  nextPosition,
  hasPrimary,
  onAdded,
}: {
  product: ProductDetail;
  reference: Reference;
  nextPosition: number;
  hasPrimary: boolean;
  onAdded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [role, setRole] = useState<Role>(hasPrimary ? "GALLERY" : "PRIMARY");
  const [colourId, setColourId] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [inputKey, setInputKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!file) problems.file = "Choose an image file.";
    else {
      const local = localUploadProblem(file);
      if (local) problems.file = local;
    }
    if (!alt.trim())
      problems.alt = "Describe the image for people who cannot see it.";
    setFields(problems);
    if (Object.keys(problems).length) {
      setError(localError("Check the highlighted fields."));
      return;
    }
    setError(null);
    setProgress(0);
    let assetId: string | null = null;
    try {
      const asset = await uploadImage(file!, setProgress);
      assetId = asset.id;
      await api.post(`/admin/products/${product.id}/images`, {
        mediaAssetId: asset.id,
        alt: alt.trim(),
        role,
        colourId: colourId || null,
        position: nextPosition,
      });
      setFile(null);
      setAlt("");
      setRole("GALLERY");
      setInputKey((k) => k + 1);
      onAdded();
    } catch (err) {
      const apiError = toApiError(err);
      const advice = uploadAdvice(apiError);
      const prefix = assetId
        ? "The file was uploaded to the media library, but adding it to the product failed: "
        : "";
      setError(
        withMessage(
          apiError,
          `${prefix}${apiError.message}${advice ? ` ${advice}` : ""}`,
        ),
      );
      setFields({});
    } finally {
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add an image">
      <fieldset className={ui.fieldset}>
        <legend>Add an image</legend>
        <Stack>
          <ErrorSummary error={error} fields={fields} idPrefix="img-" />
          <TextField
            key={inputKey}
            id="img-file"
            label="Image file"
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            hint="JPEG, PNG or WebP, up to 15 MB and 8000 pixels on each side. Photos are resized and their location data removed."
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            error={fields.file}
          />
          <TextField
            id="img-alt"
            label="Alt text"
            value={alt}
            maxLength={200}
            onChange={(e) => setAlt(e.target.value)}
            error={fields.alt}
            hint="What the image shows, for example: Rose silk kurta, front view."
          />
          <div className={s.twoColumns}>
            <SelectField
              id="img-role"
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              hint={ROLES.find((r) => r.value === role)?.hint}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="img-colour"
              label="Colour"
              value={colourId}
              onChange={(e) => setColourId(e.target.value)}
              optional
            >
              <option value="">All colours</option>
              {reference.colours.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
          {progress !== null ? (
            <div role="status">
              <p>
                {progress < 1
                  ? `Uploading… ${Math.round(progress * 100)}%`
                  : "Processing the image…"}
              </p>
              <progress
                className={ui.progress}
                max={1}
                value={progress}
                aria-label="Upload progress"
              />
            </div>
          ) : null}
          <div>
            <Button
              type="submit"
              busy={progress !== null}
              busyLabel="Uploading…"
            >
              Upload and add
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}

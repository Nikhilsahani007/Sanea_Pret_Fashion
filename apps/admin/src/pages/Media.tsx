import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { get, send } from "../api.ts";
import { thumb, type Asset } from "../types.ts";
import { Button, ErrorSummary, Notice, ui } from "../ui/ui.tsx";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 15 * 1024 * 1024;

export function Media() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["media"],
    queryFn: () => get<{ assets: Asset[] }>("/admin/media"),
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      send<{ asset: Asset }>("POST", "/admin/media", file, {
        contentType: file.type,
        headers: { "X-Filename": encodeURIComponent(file.name) },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      setDone(`Uploaded ${res.asset.originalFilename}.`);
    },
  });

  function onFiles(files: FileList | null) {
    setProblem(null);
    setDone(null);
    const file = files?.[0];
    if (!file) return;
    if (!TYPES.includes(file.type))
      return setProblem("Choose a JPEG, PNG or WebP image.");
    if (file.size > MAX) return setProblem("Images can be at most 15 MB.");
    upload.mutate(file);
  }

  return (
    <div className={ui.stack}>
      <h1>Media</h1>
      <p className={ui.muted}>
        Upload Sanéa Pret's own photographs only: no stock or generated images
        posing as products. Product images look best at 4:5, at least 1440 ×
        1800 pixels. Location and camera data are removed.
      </p>
      <div className={ui.panel}>
        <label
          htmlFor="upload"
          style={{
            display: "block",
            fontWeight: 550,
            marginBottom: "var(--sp-space-2)",
          }}
        >
          Image file (JPEG, PNG or WebP, up to 15 MB)
        </label>
        <input
          id="upload"
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          onChange={(e) => onFiles(e.target.files)}
        />
        {upload.isPending ? (
          <p role="status">Uploading and preparing sizes…</p>
        ) : null}
      </div>
      {problem ? (
        <ErrorSummary error={new Error(problem)} title={problem} />
      ) : null}
      <ErrorSummary error={upload.error} title="The upload failed" />
      {done ? <Notice>{done}</Notice> : null}
      <ul className={ui.row} style={{ listStyle: "none", padding: 0 }}>
        {list.data?.assets.map((a) => (
          <li
            key={a.id}
            className={ui.panel}
            style={{ width: "11rem", padding: "var(--sp-space-3)" }}
          >
            <img
              src={thumb(a)}
              alt=""
              width={160}
              height={200}
              style={{
                objectFit: "cover",
                width: "100%",
                height: "auto",
                aspectRatio: "4 / 5",
              }}
            />
            <p
              style={{
                margin: "var(--sp-space-2) 0 0",
                overflowWrap: "anywhere",
                fontSize: "var(--sp-step-small)",
              }}
            >
              {a.originalFilename}
              <br />
              <span className={ui.muted}>
                {a.width} × {a.height}
              </span>
            </p>
          </li>
        ))}
      </ul>
      {list.data?.assets.length === 0 ? <p>No images uploaded yet.</p> : null}
      <Button variant="secondary" onClick={() => input.current?.click()}>
        Choose another file
      </Button>
    </div>
  );
}

// The rows a content payload points at (phase-10-plan.md §3.1): entity targets,
// product sources and media assets, with the field path of each reference.
import type { ContentTarget, NavItem, ProductSource } from "@sanea/shared";

export type Ref = {
  kind: "CATEGORY" | "COLLECTION" | "PRODUCT" | "PAGE" | "MEDIA";
  id: string;
  path: string;
};

const target = (t: ContentTarget | undefined, path: string): Ref[] =>
  !t || t.kind === "PATH" ? [] : [{ kind: t.kind, id: t.id, path }];

const source = (s: ProductSource, path: string): Ref[] => {
  if (s.kind === "COLLECTION" || s.kind === "CATEGORY")
    return [{ kind: s.kind, id: s.id, path: `${path}.id` }];
  if (s.kind === "MANUAL")
    return s.productIds.map((id, i) => ({
      kind: "PRODUCT" as const,
      id,
      path: `${path}.productIds.${i}`,
    }));
  return [];
};

/** References in a block payload that has already passed its schema. */
export function blockRefs(
  key: string,
  payload: Record<string, unknown>,
): Ref[] {
  const p = payload as never as {
    link?: ContentTarget;
    slides?: {
      desktopImageId: string;
      mobileImageId: string;
      ctaTarget: ContentTarget;
    }[];
    source?: ProductSource;
    tabs?: { source: ProductSource }[];
    images?: { mediaAssetId: string }[];
  };
  switch (key) {
    case "site.announcement":
      return target(p.link, "link");
    case "home.hero":
      return (p.slides ?? []).flatMap((s, i) => [
        {
          kind: "MEDIA" as const,
          id: s.desktopImageId,
          path: `slides.${i}.desktopImageId`,
        },
        {
          kind: "MEDIA" as const,
          id: s.mobileImageId,
          path: `slides.${i}.mobileImageId`,
        },
        ...target(s.ctaTarget, `slides.${i}.ctaTarget`),
      ]);
    case "home.newIns":
    case "home.row2":
      return p.source ? source(p.source, "source") : [];
    case "home.tabbedGrid":
      return (p.tabs ?? []).flatMap((t, i) =>
        source(t.source, `tabs.${i}.source`),
      );
    case "home.editorial":
      return [
        ...(p.images ?? []).map((im, i) => ({
          kind: "MEDIA" as const,
          id: im.mediaAssetId,
          path: `images.${i}.mediaAssetId`,
        })),
        ...target(p.link, "link"),
      ];
    default:
      return [];
  }
}

export function navRefs(items: readonly NavItem[]): Ref[] {
  return items.flatMap((item, i) =>
    item.target.kind === "URL"
      ? []
      : [
          {
            kind: item.target.kind,
            id: item.target.id,
            path: `items.${i}.target.id`,
          },
        ],
  );
}

/** Image nodes in a page body. */
export function pageRefs(body: {
  content: { type: string; mediaAssetId?: string }[];
}): Ref[] {
  return body.content.flatMap((b, i) =>
    b.type === "image" && b.mediaAssetId
      ? [
          {
            kind: "MEDIA" as const,
            id: b.mediaAssetId,
            path: `draftBody.content.${i}.mediaAssetId`,
          },
        ]
      : [],
  );
}

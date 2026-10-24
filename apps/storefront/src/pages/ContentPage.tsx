import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

import { RichText } from "../components/RichText.tsx";
import { ApiError, get } from "../lib/api.ts";
import { useTitle } from "../lib/title.ts";
import { NotFound } from "./NotFound.tsx";
import s from "./pages.module.css";

type Page = {
  slug: string;
  title: string;
  body: { blocks: Parameters<typeof RichText>[0]["blocks"] };
  seoTitle: string | null;
};

/** A published content page: `/:slug`, or `/policies/:slug` for `policy-…` pages. */
export function ContentPage({ policy = false }: { policy?: boolean }) {
  const params = useParams();
  const slug = policy ? `policy-${params.slug}` : (params.slug ?? "");
  const page = useQuery({
    queryKey: ["page", slug],
    queryFn: () => get<{ page: Page }>(`/content/pages/${slug}`),
    retry: false,
  });
  useTitle(page.data?.page.seoTitle ?? page.data?.page.title);
  if (page.error instanceof ApiError && page.error.status === 404)
    return <NotFound />;
  if (page.isPending)
    return (
      <p className={s.page} role="status">
        Loading…
      </p>
    );
  if (!page.data)
    return (
      <p className={s.page} role="alert">
        This page could not be loaded. Try again in a moment.
      </p>
    );
  return (
    <article className={s.page}>
      <h1 className={s.title}>{page.data.page.title}</h1>
      <div className={s.prose}>
        <RichText blocks={page.data.page.body.blocks} />
      </div>
    </article>
  );
}

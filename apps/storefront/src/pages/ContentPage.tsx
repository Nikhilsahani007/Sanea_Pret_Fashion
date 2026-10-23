// /pages/:slug: a published page (phase-11-plan.md §4.3), rendered from its
// structured JSON node by node. No HTML is injected (no
// dangerouslySetInnerHTML); links are internal paths validated by the API.
// A page that is not public is the API's 404, shown as not found.
import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { api } from "../api/client.ts";
import type { PageBody, PublicPage } from "../api/types.ts";
import { useResource } from "../lib/resource.ts";
import { NotFound } from "../shell/NotFound.tsx";
import { Picture } from "../ui/Picture.tsx";
import s from "./pages.module.css";

type Block = PageBody["content"][number];
type Inline = Extract<Block, { type: "paragraph" }>["content"][number];
type Text = Extract<Inline, { type: "text" }>;

function text(node: Text, key: number): ReactNode {
  let out: ReactNode = node.text;
  if (node.marks?.includes("italic")) out = <em>{out}</em>;
  if (node.marks?.includes("bold")) out = <strong>{out}</strong>;
  return <span key={key}>{out}</span>;
}

function inline(nodes: readonly Inline[]): ReactNode[] {
  return nodes.map((n, i) =>
    n.type === "link" ? (
      <Link key={i} to={n.href}>
        {n.content.map(text)}
      </Link>
    ) : (
      text(n, i)
    ),
  );
}

function block(b: Block, i: number): ReactNode {
  switch (b.type) {
    case "paragraph":
      return <p key={i}>{inline(b.content)}</p>;
    case "heading":
      return b.level === 2 ? (
        <h2 key={i}>{b.content.map(text)}</h2>
      ) : (
        <h3 key={i}>{b.content.map(text)}</h3>
      );
    case "bulletList":
    case "orderedList": {
      const List = b.type === "bulletList" ? "ul" : "ol";
      return (
        <List key={i}>
          {b.items.map((p, j) => (
            <li key={j}>{inline(p.content)}</li>
          ))}
        </List>
      );
    }
    case "image":
      return (
        <figure key={i}>
          <Picture image={b.image} sizes="(min-width: 48rem) 42rem, 100vw" />
          {b.caption ? <figcaption>{b.caption}</figcaption> : null}
        </figure>
      );
  }
}

export function ContentPage() {
  const { slug = "" } = useParams();
  const page = useResource<PublicPage>(
    (signal) => api.get(`/content/pages/${encodeURIComponent(slug)}`, signal),
    [slug],
  );
  useEffect(() => {
    if (page.status === "ready")
      document.title = `${page.data.seoTitle ?? page.data.title} · Sanéa Pret`;
  }, [page]);

  if (page.status === "loading") return <p>Loading…</p>;
  if (page.status === "error")
    return page.error.status === 404 ? (
      <NotFound />
    ) : (
      <div role="alert">
        <p>{page.error.message}</p>
        <button type="button" onClick={page.reload}>
          Try again
        </button>
      </div>
    );
  return (
    <article className={s.article} aria-labelledby="page-title">
      <h1 id="page-title">{page.data.title}</h1>
      {page.data.body.content.map(block)}
    </article>
  );
}

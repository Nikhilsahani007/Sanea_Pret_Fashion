// Content screens: the Rehma Foundation verification (Owner only, checkbox
// required, the reviewed version sent, a changed draft explained), editing
// rights, block publishing rules, payload pruning and the navigation marker.
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Admin, PageView } from "../api/types.ts";
import {
  ADMINS,
  apiError,
  renderAt,
  signedInAs,
  stubApi,
} from "../test/helpers.tsx";
import { BlockEditor, prune } from "./BlockEditor.tsx";
import { NavigationEditor } from "./NavigationEditor.tsx";
import { PageEditor, VERIFY_STATEMENT } from "./PageEditor.tsx";

const REHMA: PageView = {
  id: "pg1",
  slug: "rehma-foundation",
  title: "Rehma Foundation",
  draftBody: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "TEST synthetic wording." }],
      },
    ],
  },
  publishedBody: null,
  status: "DRAFT",
  requiresVerification: true,
  verifiedAt: null,
  seoTitle: null,
  seoDescription: null,
  draftVersion: "2026-10-23T06:00:00.123Z",
  unpublishedChanges: true,
};
const empty = { body: { items: [], nextCursor: null } };

function openPage(admin: Admin, extra = {}) {
  const api = stubApi({
    ...signedInAs(admin),
    "GET /admin/content/pages/rehma-foundation": { body: REHMA },
    "GET /admin/media": empty,
    ...extra,
  });
  renderAt(
    "/content/pages/rehma-foundation",
    [{ path: "/content/pages/:slug", element: <PageEditor /> }],
    { shell: true },
  );
  return api;
}

describe("Rehma Foundation page", () => {
  it("only the Owner sees Verify and publish; the checkbox is required; the reviewed version is sent", async () => {
    const user = userEvent.setup();
    const { calls } = openPage(ADMINS.OWNER, {
      "POST /admin/content/pages/rehma-foundation/publish": {
        body: {
          ...REHMA,
          status: "PUBLISHED",
          verifiedAt: "2026-10-23T06:05:00Z",
        },
      },
    });
    const panel = await screen.findByRole("region", {
      name: "Verify and publish",
    });
    expect(within(panel).getByText("TEST synthetic wording.")).toBeTruthy();
    const button = within(panel).getByRole("button", {
      name: "Verify and publish",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(panel).getByLabelText(VERIFY_STATEMENT));
    await user.click(button);
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        verified: true,
        draftVersion: REHMA.draftVersion,
      }),
    );
    expect(await screen.findByText(/Verified and published/)).toBeTruthy();
    // There is no plain "Publish" for a page that needs verification.
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("explains a draft changed after review", async () => {
    const user = userEvent.setup();
    openPage(ADMINS.OWNER, {
      "POST /admin/content/pages/rehma-foundation/publish": apiError(
        409,
        "CONFLICT",
        "This change conflicts with the current state.",
        [
          {
            path: "body.draftVersion",
            code: "DRAFT_CHANGED",
            message: "The draft changed after you reviewed it.",
          },
        ],
      ),
    });
    const panel = await screen.findByRole("region", {
      name: "Verify and publish",
    });
    await user.click(within(panel).getByLabelText(VERIFY_STATEMENT));
    await user.click(
      within(panel).getByRole("button", { name: "Verify and publish" }),
    );
    expect(
      await within(panel).findByText("The draft changed after you opened it"),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Reload the draft" }),
    ).toBeTruthy();
  });

  it("a Manager edits the draft but cannot verify or publish", async () => {
    openPage(ADMINS.MANAGER);
    await screen.findByRole("heading", { name: "Rehma Foundation", level: 1 });
    expect(
      screen.queryByRole("region", { name: "Verify and publish" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByLabelText("Title").matches(":disabled")).toBe(false);
  });

  it("a catalogue editor sees it read-only", async () => {
    openPage(ADMINS.CATALOGUE_EDITOR);
    expect(
      await screen.findByText(
        "Only the Owner or a Manager can edit this page.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Title").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });
});

describe("blocks", () => {
  const block = {
    key: "site.announcement",
    type: "ANNOUNCEMENT_BAR",
    draft: { text: "TEST draft" },
    published: null,
    publishedAt: null,
    updatedAt: "2026-10-23T06:00:00Z",
    unpublishedChanges: true,
  };
  const refs = {
    "GET /admin/categories": { body: { items: [] } },
    "GET /admin/collections": { body: { items: [] } },
    "GET /admin/content/pages": { body: { items: [] } },
    "GET /admin/products": empty,
    "GET /admin/media": empty,
  };

  it("saves before publishing, links API errors to fields, and publishes", async () => {
    const user = userEvent.setup();
    let saved = false;
    const { calls } = stubApi({
      ...signedInAs(ADMINS.CATALOGUE_EDITOR),
      ...refs,
      "GET /admin/content/blocks/site.announcement": { body: block },
      "PUT /admin/content/blocks/site.announcement": (c) =>
        (c.body as { text: string }).text.includes("<")
          ? apiError(400, "VALIDATION_FAILED", "The request is not valid.", [
              {
                path: "body.text",
                code: "INVALID",
                message: "This value is not valid.",
              },
            ])
          : ((saved = true), { body: { ...block, draft: c.body } }),
      "POST /admin/content/blocks/site.announcement/publish": {
        body: {
          ...block,
          published: block.draft,
          publishedAt: "2026-10-23T06:01:00Z",
          unpublishedChanges: false,
        },
      },
    });
    renderAt(
      "/content/blocks/site.announcement",
      [{ path: "/content/blocks/:key", element: <BlockEditor /> }],
      { shell: true },
    );
    const text = await screen.findByLabelText("Text");
    await user.clear(text);
    await user.type(text, "<b>x</b>");
    expect(
      (screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("This value is not valid.", { selector: "p" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Text").getAttribute("aria-invalid")).toBe(
      "true",
    );
    await user.clear(screen.getByLabelText("Text"));
    await user.type(screen.getByLabelText("Text"), "Free shipping");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saved).toBe(true));
    expect(calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({
      text: "Free shipping",
    });
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    expect(
      await screen.findByText(/Published\. The shop shows it/),
    ).toBeTruthy();
  });

  it("prunes empty optional values before sending", () => {
    expect(
      prune({
        text: "x",
        link: undefined,
        startsAt: "",
        contact: { hours: "" },
        slides: [{ alt: "a", campaignLine: "" }],
      }),
    ).toEqual({
      text: "x",
      slides: [{ alt: "a" }],
    });
  });
});

describe("navigation", () => {
  it("marks links whose target is not public, and saves the whole menu in order", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.MANAGER),
      "GET /admin/content/navigation/HEADER": {
        body: {
          menu: "HEADER",
          maxItems: 12,
          items: [
            {
              label: "Search",
              target: { kind: "URL", url: "/search" },
              href: "/search",
              hidden: false,
            },
            {
              label: "Draft page",
              target: { kind: "PAGE", id: "pg2" },
              href: null,
              hidden: true,
            },
          ],
        },
      },
      "GET /admin/categories": { body: { items: [] } },
      "GET /admin/collections": { body: { items: [] } },
      "GET /admin/content/pages": {
        body: {
          items: [
            {
              ...REHMA,
              id: "pg2",
              slug: "draft",
              title: "Draft page",
              requiresVerification: false,
            },
          ],
        },
      },
      "GET /admin/products": empty,
      "GET /admin/media": empty,
      "PUT /admin/content/navigation/HEADER": { body: {} },
    });
    renderAt(
      "/content/navigation/HEADER",
      [{ path: "/content/navigation/:menu", element: <NavigationEditor /> }],
      { shell: true },
    );
    expect(
      await screen.findByText(
        "Hidden on the shop: the target is not published.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Move link 2 up" }));
    await user.click(screen.getByRole("button", { name: "Save menu" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        items: [
          { label: "Draft page", target: { kind: "PAGE", id: "pg2" } },
          { label: "Search", target: { kind: "URL", url: "/search" } },
        ],
      }),
    );
  });
});

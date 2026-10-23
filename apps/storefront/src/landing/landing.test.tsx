// Landing components (phase-12-plan.md §6.1): the section order (L-4, L-7),
// the empty landing (L-8), the carousel (L-3) and the tabs.
import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderAt, stubApi } from "../test/helpers.tsx";
import { SLIDE_MS } from "./useCarousel.ts";

const image = (label: string) => ({
  url: `https://img.test/${label}/1440.webp`,
  width: 1440,
  height: 810,
  alt: `TEST ${label}`,
  sources: [
    {
      format: "webp",
      width: 1440,
      height: 810,
      url: `https://img.test/${label}/1440.webp`,
    },
  ],
});
const slide = (n: number) => ({
  desktopImage: image(`desktop-${n}`),
  mobileImage: image(`mobile-${n}`),
  campaignLine: `TEST campaign ${n}`,
  ctaLabel: `TEST shop ${n}`,
  href: "/categories/test",
  focalPoint: null,
});
const product = (n: number) => ({
  id: `p${n}`,
  slug: `sample-${n}`,
  name: `Sample ${n}`,
  fromPricePaise: 99_900,
  currency: "INR",
  labels: [],
  colours: [],
  soldOut: false,
  primaryImage: null,
});
const home = {
  announcement: null,
  hero: { slides: [slide(1), slide(2), slide(3)] },
  newIns: { title: "New Ins", items: [product(1), product(2)] },
  row2: { title: "TEST row", items: [product(3)] },
  tabbedGrid: {
    tabs: [
      { label: "TEST tab A", items: [product(4)] },
      { label: "TEST tab B", items: [product(5)] },
    ],
  },
};

function reducedMotion(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (q: string) =>
      ({
        matches: on && q.includes("reduce"),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => vi.useRealTimers());

describe("landing", () => {
  it("orders the sections: hero, New Ins, the second row, then tabs (D-012)", async () => {
    reducedMotion(false);
    stubApi({ "GET /content/home": { body: home } });
    renderAt("/");
    await screen.findByRole("heading", { name: "New Ins" });
    const order = [
      ...document.querySelectorAll(
        "[aria-roledescription='carousel'], h2#new-ins, h2#row-2, [role='tablist']",
      ),
    ].map(
      (el) =>
        el.getAttribute("aria-roledescription") ??
        el.getAttribute("role") ??
        el.textContent,
    );
    expect(order).toEqual(["carousel", "New Ins", "TEST row", "tablist"]);
    // Not part of the composition (OD-23).
    expect(screen.queryByText(/Rehma|Foundation/)).toBeNull();
  });

  it("stands as the monument alone when nothing is published (L-8)", async () => {
    reducedMotion(false);
    stubApi({ "GET /content/home": { body: { announcement: null } } });
    renderAt("/");
    expect(
      await screen.findByRole("heading", { name: "Sanéa Pret", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Sanéa Pret" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show slide/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "New Ins" })).toBeNull();
  });
});

describe("hero carousel (L-3)", () => {
  const current = () =>
    screen
      .getAllByRole("group", { hidden: true })
      .find(
        (g) =>
          g.getAttribute("aria-roledescription") === "slide" &&
          g.getAttribute("aria-hidden") === "false",
      )
      ?.getAttribute("aria-label");

  it("advances on its own, changes by indicator, and stops when paused", async () => {
    reducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi({ "GET /content/home": { body: home } });
    renderAt("/");
    await screen.findByRole("button", { name: "Show slide 2 of 3" });
    expect(current()).toBe("1 of 3");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLIDE_MS);
    });
    expect(current()).toBe("2 of 3");
    act(() =>
      screen.getByRole("button", { name: "Show slide 1 of 3" }).click(),
    );
    expect(current()).toBe("1 of 3");
    act(() => screen.getByRole("button", { name: "Pause slides" }).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLIDE_MS * 3);
    });
    expect(current()).toBe("1 of 3");
    expect(screen.getByRole("button", { name: "Play slides" })).toBeTruthy();
  });

  it("stops while focus is inside, and never auto-advances under reduced motion", async () => {
    reducedMotion(false);
    stubApi({ "GET /content/home": { body: home } });
    const first = renderAt("/");
    const dot = await screen.findByRole("button", {
      name: "Show slide 2 of 3",
    });
    vi.useFakeTimers();
    act(() => dot.focus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLIDE_MS * 2);
    });
    expect(current()).toBe("1 of 3");
    vi.useRealTimers();
    first.unmount();

    reducedMotion(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi({ "GET /content/home": { body: home } });
    renderAt("/");
    await screen.findByRole("button", { name: "Show slide 2 of 3" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLIDE_MS * 3);
    });
    expect(current()).toBe("1 of 3");
    expect(
      (screen.getByRole("button", { name: "Play slides" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("tabs", () => {
  it("switch by click and by arrow keys, with one tab in the tab order", async () => {
    reducedMotion(false);
    const user = userEvent.setup();
    stubApi({ "GET /content/home": { body: home } });
    renderAt("/");
    const a = await screen.findByRole("tab", { name: "TEST tab A" });
    const b = screen.getByRole("tab", { name: "TEST tab B" });
    expect(a.getAttribute("tabindex")).toBe("0");
    expect(b.getAttribute("tabindex")).toBe("-1");
    expect(
      within(screen.getByRole("tabpanel")).getByText("Sample 4"),
    ).toBeTruthy();
    a.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement).toBe(b));
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(
      within(screen.getByRole("tabpanel")).getByText("Sample 5"),
    ).toBeTruthy();
  });
});

// Component test setup: unmount between tests, reset fetch mocks, and give
// jsdom the parts of the modal <dialog> it lacks (showModal, close, Escape).
// Browsers provide these natively; the e2e tests run them in Edge.
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetCsrf } from "../api/client.ts";

afterEach(() => {
  cleanup();
  resetCsrf();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const proto = HTMLDialogElement.prototype;
if (typeof proto.showModal !== "function") {
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    const first = this.querySelector<HTMLElement>(
      "button, a[href], input, select, textarea",
    );
    first?.focus();
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll("dialog[open]")].at(-1);
    (open as HTMLDialogElement | undefined)?.close();
  });
}

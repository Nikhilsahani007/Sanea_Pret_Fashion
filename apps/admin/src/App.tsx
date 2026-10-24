import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { useAuth } from "./auth.tsx";
import { Home } from "./pages/Home.tsx";
import { Shell } from "./pages/Shell.tsx";
import { SignIn } from "./pages/SignIn.tsx";

const ContentHome = lazy(() =>
  import("./pages/ContentHome.tsx").then((m) => ({ default: m.ContentHome })),
);
const Categories = lazy(() =>
  import("./pages/Categories.tsx").then((m) => ({ default: m.Categories })),
);
const Collections = lazy(() =>
  import("./pages/Collections.tsx").then((m) => ({ default: m.Collections })),
);
const Colours = lazy(() =>
  import("./pages/Colours.tsx").then((m) => ({ default: m.Colours })),
);
const Inventory = lazy(() =>
  import("./pages/Inventory.tsx").then((m) => ({ default: m.Inventory })),
);
const Media = lazy(() =>
  import("./pages/Media.tsx").then((m) => ({ default: m.Media })),
);
const Navigation = lazy(() =>
  import("./pages/Navigation.tsx").then((m) => ({ default: m.Navigation })),
);
const Pages = lazy(() =>
  import("./pages/Pages.tsx").then((m) => ({ default: m.Pages })),
);
const ProductEditor = lazy(() =>
  import("./pages/ProductEditor.tsx").then((m) => ({
    default: m.ProductEditor,
  })),
);
const Products = lazy(() =>
  import("./pages/Products.tsx").then((m) => ({ default: m.Products })),
);
const Settings = lazy(() =>
  import("./pages/Settings.tsx").then((m) => ({ default: m.Settings })),
);
const AcceptInvite = lazy(() =>
  import("./pages/AcceptInvite.tsx").then((m) => ({ default: m.AcceptInvite })),
);

// Screens load on first visit, so sign-in and the shell stay small.
const page = (node: ReactNode) => (
  <Suspense fallback={<p role="status">Loading…</p>}>{node}</Suspense>
);

function Protected() {
  const { state } = useAuth();
  if (state.status === "loading")
    return (
      <p role="status" style={{ padding: "2rem" }}>
        Loading…
      </p>
    );
  if (state.status === "signedOut") return <SignIn />;
  return <Shell />;
}

const router = createBrowserRouter([
  { path: "/accept-invite", element: page(<AcceptInvite />) },
  {
    path: "/",
    element: <Protected />,
    children: [
      { index: true, element: <Home /> },
      { path: "products", element: page(<Products />) },
      { path: "products/new", element: page(<ProductEditor />) },
      { path: "products/:id", element: page(<ProductEditor />) },
      { path: "categories", element: page(<Categories />) },
      { path: "collections", element: page(<Collections />) },
      { path: "colours", element: page(<Colours />) },
      { path: "media", element: page(<Media />) },
      { path: "inventory", element: page(<Inventory />) },
      { path: "content/home", element: page(<ContentHome />) },
      { path: "content/pages", element: page(<Pages />) },
      { path: "content/navigation", element: page(<Navigation />) },
      { path: "settings", element: page(<Settings />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

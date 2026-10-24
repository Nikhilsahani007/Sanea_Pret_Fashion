import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { Layout } from "./components/Layout.tsx";
import { CartPage } from "./pages/CartPage.tsx";
import { ContentPage } from "./pages/ContentPage.tsx";
import { Home } from "./pages/Home.tsx";
import { Contact } from "./pages/Contact.tsx";
import { Collections, Listing } from "./pages/Listing.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { Product } from "./pages/Product.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";

// Checkout pages load on demand: they carry the shared validation schemas.
const Checkout = lazy(() =>
  import("./pages/Checkout.tsx").then((m) => ({ default: m.Checkout })),
);
const MockPay = lazy(() =>
  import("./pages/MockPay.tsx").then((m) => ({ default: m.MockPay })),
);
const OrderStatus = lazy(() =>
  import("./pages/OrderStatus.tsx").then((m) => ({ default: m.OrderStatus })),
);
const later = (page: ReactNode) => (
  <Suspense fallback={<p role="status">Loading…</p>}>{page}</Suspense>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "search", element: <SearchPage /> },
      { path: "new-in", element: <Listing key="new" kind="new" /> },
      { path: "shop", element: <Listing key="all" kind="all" /> },
      { path: "shop/:slug", element: <Listing kind="category" /> },
      { path: "collections", element: <Collections /> },
      { path: "collections/:slug", element: <Listing kind="collection" /> },
      { path: "products/:slug", element: <Product /> },
      { path: "contact", element: <Contact /> },
      { path: "cart", element: <CartPage /> },
      { path: "checkout", element: later(<Checkout />) },
      { path: "checkout/pay/mock/:paymentId", element: later(<MockPay />) },
      { path: "order/:orderNumber", element: later(<OrderStatus />) },
      { path: "policies/:slug", element: <ContentPage policy /> },
      { path: ":slug", element: <ContentPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

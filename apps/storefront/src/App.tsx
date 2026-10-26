// Routes (phase-11-plan.md §4.3; phase-13-plan.md; D-179; phase-15-plan.md).
// Listings live under /shop (all products and categories), /new-in and
// /collections/:slug; the product page under /products/:slug. The old
// /categories/:slug links redirect to /shop/:slug. Checkout, the test payment
// page and the guest order page arrive in Phase 15.
import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router";

import {
  CategoryListing,
  CollectionListing,
  NewIns,
  ShopAll,
} from "./browse/Listing.tsx";
import { ProductPage } from "./browse/ProductPage.tsx";
import { CartPage } from "./cart/CartPage.tsx";
import { CartProvider } from "./cart/CartProvider.tsx";
import { ContentPage } from "./pages/ContentPage.tsx";
import { Landing } from "./landing/Landing.tsx";
import { SearchPage } from "./search/SearchPage.tsx";
import { Layout } from "./shell/Layout.tsx";
import { NotFound } from "./shell/NotFound.tsx";
import shell from "./shell/shell.module.css";

// Checkout pages load on demand: they carry the shared validation schemas.
const Checkout = lazy(() =>
  import("./checkout/Checkout.tsx").then((m) => ({ default: m.Checkout })),
);
const MockPay = lazy(() =>
  import("./checkout/MockPay.tsx").then((m) => ({ default: m.MockPay })),
);
const OrderStatus = lazy(() =>
  import("./checkout/OrderStatus.tsx").then((m) => ({
    default: m.OrderStatus,
  })),
);
// The fallback holds a screen's height, so the footer does not jump into view
// and back while the page's code loads (Lighthouse layout shift, Phase 17).
const later = (page: ReactNode) => (
  <Suspense
    fallback={
      <div className={shell.pending}>
        <p role="status" className="visually-hidden">
          Loading
        </p>
      </div>
    }
  >
    {page}
  </Suspense>
);

function CategoryRedirect() {
  const { slug = "" } = useParams();
  return <Navigate to={`/shop/${slug}`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="/shop" element={<ShopAll />} />
        <Route path="/shop/:slug" element={<CategoryListing />} />
        <Route path="/new-in" element={<NewIns />} />
        <Route path="/collections/:slug" element={<CollectionListing />} />
        <Route path="/categories/:slug" element={<CategoryRedirect />} />
        <Route path="/products/:slug" element={<ProductPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={later(<Checkout />)} />
        <Route
          path="/checkout/pay/mock/:paymentId"
          element={later(<MockPay />)}
        />
        <Route path="/orders/:orderNumber" element={later(<OrderStatus />)} />
        <Route path="/pages/:slug" element={<ContentPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </BrowserRouter>
  );
}

// Routes (phase-11-plan.md §4.3; phase-13-plan.md; D-179). Listings live under
// /shop (all products and categories), /new-in and /collections/:slug; the
// product page under /products/:slug. The old /categories/:slug links
// redirect to /shop/:slug so existing links keep working.
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

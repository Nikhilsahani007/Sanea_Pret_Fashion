// Routes (phase-11-plan.md §4.3). Phase 11 serves the shell, search, the cart
// and published pages; links to Phase 13 pages reach the coming-soon page
// (Q11-7, D-098). The landing page comes in Phase 12.
import { BrowserRouter, Route, Routes } from "react-router";

import { CartPage } from "./cart/CartPage.tsx";
import { CartProvider } from "./cart/CartProvider.tsx";
import { ContentPage } from "./pages/ContentPage.tsx";
import { Landing } from "./landing/Landing.tsx";
import { SearchPage } from "./search/SearchPage.tsx";
import { Layout } from "./shell/Layout.tsx";
import { NotFound } from "./shell/NotFound.tsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
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

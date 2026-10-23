// Routes (phase-11-plan.md §4.3). Phase 11 serves the shell, search, the cart
// and published pages; the landing page comes in Phase 12.
import { BrowserRouter, Route, Routes } from "react-router";

import { Layout } from "./shell/Layout.tsx";
import { NotFound } from "./shell/NotFound.tsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

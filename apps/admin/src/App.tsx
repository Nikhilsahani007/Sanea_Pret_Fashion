// Routes (phase-8-ui-plan.md §3). Screens a role cannot use show the API's
// forbidden state; navigation hides them as a convenience.
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router";

import { AcceptInvite } from "./auth/AcceptInvite.tsx";
import { SessionProvider } from "./auth/session.tsx";
import { SignIn } from "./auth/SignIn.tsx";
import { Categories } from "./catalogue/Categories.tsx";
import { CollectionEditor, Collections } from "./catalogue/Collections.tsx";
import { Colours } from "./catalogue/Colours.tsx";
import { MediaLibrary } from "./catalogue/MediaLibrary.tsx";
import { ProductEditor } from "./catalogue/ProductEditor.tsx";
import { ProductNew } from "./catalogue/ProductNew.tsx";
import { ProductsList } from "./catalogue/ProductsList.tsx";
import { SizeCharts } from "./catalogue/SizeCharts.tsx";
import { Inventory } from "./inventory/Inventory.tsx";
import { Movements } from "./inventory/Movements.tsx";
import { RequireSession } from "./shell/AppShell.tsx";
import { Notice, PageHeader, Stack } from "./ui/feedback.tsx";

function NotFound() {
  return (
    <Stack gap="4">
      <PageHeader title="Page not found" />
      <Notice>
        <p>
          This address does not match a screen.{" "}
          <Link to="/products">Go to products</Link>.
        </p>
      </Notice>
    </Stack>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route element={<RequireSession />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<ProductsList />} />
        <Route path="/products/new" element={<ProductNew />} />
        <Route path="/products/:id" element={<ProductEditor />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<CollectionEditor />} />
        <Route path="/colours" element={<Colours />} />
        <Route path="/size-charts" element={<SizeCharts />} />
        <Route path="/media" element={<MediaLibrary />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/inventory/movements" element={<Movements />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}

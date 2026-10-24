import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import { useAuth } from "./auth.tsx";
import { AcceptInvite } from "./pages/AcceptInvite.tsx";
import { Categories } from "./pages/Categories.tsx";
import { Collections } from "./pages/Collections.tsx";
import { Colours } from "./pages/Colours.tsx";
import { Home } from "./pages/Home.tsx";
import { Media } from "./pages/Media.tsx";
import { ProductEditor } from "./pages/ProductEditor.tsx";
import { Products } from "./pages/Products.tsx";
import { Shell } from "./pages/Shell.tsx";
import { SignIn } from "./pages/SignIn.tsx";

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
  { path: "/accept-invite", element: <AcceptInvite /> },
  {
    path: "/",
    element: <Protected />,
    children: [
      { index: true, element: <Home /> },
      { path: "products", element: <Products /> },
      { path: "products/new", element: <ProductEditor /> },
      { path: "products/:id", element: <ProductEditor /> },
      { path: "categories", element: <Categories /> },
      { path: "collections", element: <Collections /> },
      { path: "colours", element: <Colours /> },
      { path: "media", element: <Media /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

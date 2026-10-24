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
      { path: "policies/:slug", element: <ContentPage policy /> },
      { path: ":slug", element: <ContentPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

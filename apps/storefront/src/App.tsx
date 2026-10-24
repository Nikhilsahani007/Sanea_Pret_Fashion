import { createBrowserRouter, RouterProvider } from "react-router";

import { Layout } from "./components/Layout.tsx";
import { CartPage } from "./pages/CartPage.tsx";
import { ContentPage } from "./pages/ContentPage.tsx";
import { Home } from "./pages/Home.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "search", element: <SearchPage /> },
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

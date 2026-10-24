import { useEffect } from "react";

/** Sets the document title: "<page> · Sanéa Pret". */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title
      ? `${title} · Sanéa Pret`
      : "Sanéa Pret · Effortless Elegance";
  }, [title]);
}

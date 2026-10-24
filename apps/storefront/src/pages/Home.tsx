// Phase 12 builds the landing page here; Phase 11 keeps the shell only.
import { useTitle } from "../lib/title.ts";
import s from "./pages.module.css";

export function Home() {
  useTitle(null);
  return (
    <div className={s.page}>
      <h1 className={s.title}>Sanéa Pret</h1>
      <p className={s.lead}>Effortless Elegance.</p>
    </div>
  );
}

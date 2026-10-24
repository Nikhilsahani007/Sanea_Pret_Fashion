import { EnquiryForm } from "../components/EnquiryForm.tsx";
import { useSettings } from "../lib/hooks.ts";
import { useTitle } from "../lib/title.ts";
import { whatsappHref } from "../lib/whatsapp.ts";
import s from "./pages.module.css";

/** /contact: the general enquiry form and the contact details from settings. */
export function Contact() {
  useTitle("Contact");
  const st = useSettings().data;
  return (
    <div className={s.page}>
      <h1 className={s.title}>Contact</h1>
      <div className={s.cartLayout}>
        <EnquiryForm />
        {st && (st.whatsappNumber || st.contactEmail || st.contactPhone) ? (
          <aside className={s.summary} aria-label="Other ways to reach us">
            {st.whatsappNumber ? (
              <a
                href={whatsappHref(st.whatsappNumber, {
                  name: "your collection",
                  url: window.location.origin,
                })}
                target="_blank"
                rel="noopener noreferrer"
              >
                Message us on WhatsApp
              </a>
            ) : null}
            {st.contactEmail ? (
              <a href={`mailto:${st.contactEmail}`}>{st.contactEmail}</a>
            ) : null}
            {st.contactPhone ? (
              <a href={`tel:${st.contactPhone}`}>{st.contactPhone}</a>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// Guest order access tokens live only in this tab's session storage: the
// status page needs one, and nothing else on the site can read the order.
const key = (orderNumber: string) => `sp:order:${orderNumber}`;

export function rememberOrder(orderNumber: string, token: string) {
  try {
    sessionStorage.setItem(key(orderNumber), token);
  } catch {
    // Private mode without storage: the page shows the "open it here" note.
  }
}

export function orderToken(orderNumber: string): string | null {
  try {
    return sessionStorage.getItem(key(orderNumber));
  } catch {
    return null;
  }
}

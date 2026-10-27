// Guest order access tokens live only in this tab's session storage: the
// status page needs one, and nothing else on the site can read the order.
const key = (orderNumber: string) => `sp:order:${orderNumber}`;

export function rememberOrder(orderNumber: string, token: string) {
  try {
    sessionStorage.setItem(key(orderNumber), token);
  } catch {
    // Storage blocked: the status page explains how to see the order.
  }
}

export function orderToken(orderNumber: string): string | null {
  try {
    return sessionStorage.getItem(key(orderNumber));
  } catch {
    return null;
  }
}

/**
 * Opens the payment page for an order and returns true, or returns false
 * when there is none. The mock's page is a route here; PhonePe's is on a
 * phonepe.com host over https, and nothing else is followed.
 */
export function openPayment(
  payload: { payPath?: string; redirectUrl?: string } | null | undefined,
  orderNumber: string,
  navigate: (to: string) => void,
): boolean {
  if (payload?.payPath?.startsWith("/checkout/pay/")) {
    navigate(`${payload.payPath}?order=${encodeURIComponent(orderNumber)}`);
    return true;
  }
  if (payload?.redirectUrl) {
    let url: URL;
    try {
      url = new URL(payload.redirectUrl);
    } catch {
      return false;
    }
    if (
      url.protocol === "https:" &&
      (url.hostname === "phonepe.com" || url.hostname.endsWith(".phonepe.com"))
    ) {
      window.location.assign(url.href);
      return true;
    }
  }
  return false;
}

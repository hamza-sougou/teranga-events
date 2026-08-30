// No PublicNavbar here on purpose — checkout is a focused flow, not a
// browsing surface. A separate route group from (public) so this doesn't
// have to fight the navbar visibility context those pages share; the group
// name is invisible in the URL, so /checkout and /checkout/confirmation are
// unaffected.
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

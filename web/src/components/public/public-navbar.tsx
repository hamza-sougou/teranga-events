import { PublicNavbarTop } from './public-navbar-top';
import { PublicNavbarCategories } from './public-navbar-categories';

// Two separate tiers, two separate components (PublicNavbarTop always
// visible, PublicNavbarCategories hideable via PublicNavbarVisibilityContext)
// but rendered here with no border/shadow between them — same bg-bg, one
// continuous block. Only this wrapper carries the border that separates the
// whole navbar from the page content below it.
export function PublicNavbar() {
  return (
    <header className="border-b border-border bg-bg">
      <PublicNavbarTop />
      <PublicNavbarCategories />
    </header>
  );
}

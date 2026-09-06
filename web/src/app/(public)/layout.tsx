import { PublicNavbarProvider } from '@/components/public/public-navbar-context';
import { PublicNavbar } from '@/components/public/public-navbar';
import { PublicFooter } from '@/components/public/public-footer';

// Shared by every public/participant route (event detail, checkout, and its
// confirmation page) — the navbar lives here once instead of being repeated
// per page. See public-navbar-context.tsx for how a future page (the home
// hero) can hide the bottom category tier without editing PublicNavbar.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicNavbarProvider>
      <PublicNavbar />
      {children}
      <PublicFooter />
    </PublicNavbarProvider>
  );
}

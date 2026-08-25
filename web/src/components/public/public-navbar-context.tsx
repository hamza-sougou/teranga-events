'use client';

import { createContext, useContext, useState } from 'react';

interface PublicNavbarVisibilityValue {
  categoriesVisible: boolean;
  setCategoriesVisible: (visible: boolean) => void;
}

const PublicNavbarVisibilityContext = createContext<PublicNavbarVisibilityValue | null>(null);

// Lets a page control the bottom category tier from the outside, without
// PublicNavbar (rendered by the (public) layout, above every page) knowing
// anything about any one page's scroll state.
//
// Future home hero: reuse the IntersectionObserver+sentinel pattern already
// used by EventPage for StickyBuyBar (see app/(public)/events/[slug]/page.tsx)
// — place a sentinel right after the hero, and on its visibility change call:
//   const { setCategoriesVisible } = usePublicNavbarVisibility();
//   useEffect(() => setCategoriesVisible(!pastHero), [pastHero]);
// No change to PublicNavbar or this context is needed to wire that up.
export function PublicNavbarProvider({ children }: { children: React.ReactNode }) {
  const [categoriesVisible, setCategoriesVisible] = useState(true);
  return (
    <PublicNavbarVisibilityContext.Provider value={{ categoriesVisible, setCategoriesVisible }}>
      {children}
    </PublicNavbarVisibilityContext.Provider>
  );
}

export function usePublicNavbarVisibility(): PublicNavbarVisibilityValue {
  const ctx = useContext(PublicNavbarVisibilityContext);
  if (!ctx) throw new Error('usePublicNavbarVisibility must be used within PublicNavbarProvider');
  return ctx;
}

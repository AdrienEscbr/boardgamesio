import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import Toaster from '@bgio/ui/components/Toaster.jsx';
import Home from './platform/home/Home.jsx';
import RoomScreen from './platform/room/RoomScreen.jsx';

// Design review pages (not linked from the UI).
const CardGallery = lazy(() => import('@bgio/tarot/client/CardGallery.jsx'));
const NavalShowcase = lazy(() => import('@bgio/naval/client/Showcase.jsx'));
const P4Showcase = lazy(() => import('@bgio/p4/client/Showcase.jsx'));
const DutchShowcase = lazy(() => import('@bgio/dutch/client/Showcase.jsx'));
const CactusShowcase = lazy(() => import('@bgio/cactus/client/Showcase.jsx'));
const MindShowcase = lazy(() => import('@bgio/mind/client/Showcase.jsx'));

// HashRouter: GitHub Pages has no SPA fallback, so deep links (/#/room/ABCDE) must live in the hash.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Routes>
          <Route index element={<Home />} />
          <Route path="room/:code" element={<RoomScreen />} />
          <Route path="dev/cartes" element={<Suspense fallback={null}><CardGallery /></Suspense>} />
          <Route path="dev/naval" element={<Suspense fallback={null}><NavalShowcase /></Suspense>} />
          <Route path="dev/p4" element={<Suspense fallback={null}><P4Showcase /></Suspense>} />
          <Route path="dev/dutch" element={<Suspense fallback={null}><DutchShowcase /></Suspense>} />
          <Route path="dev/cactus" element={<Suspense fallback={null}><CactusShowcase /></Suspense>} />
          <Route path="dev/mind" element={<Suspense fallback={null}><MindShowcase /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <Toaster />
    </MotionConfig>
  );
}

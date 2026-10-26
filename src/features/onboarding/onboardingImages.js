// ─────────────────────────────────────────────────────────────────────────────
// features/onboarding/onboardingImages.js — Caching & prefetching for tour artwork.
//
// Onboarding illustrations are large (166 KB - 1.5 MB PNGs). Without explicit
// prefetching and caching, swiping between slides causes frame drops or visible
// blank frames while the native decoder processes the next bitmap.
//
// This module provides:
//   1. Explicit asset exports for onboarding1, onboarding2, onboarding3.
//   2. `prefetchOnboardingImages()` to prime Fresco (Android) and NSURLCache /
//      Image cache (iOS) before or as the user opens the onboarding tour.
// ─────────────────────────────────────────────────────────────────────────────

import { Image } from 'react-native';

export const ONBOARDING_1 = require('../../assets/screens/onboarding/onboarding1.png');
export const ONBOARDING_2 = require('../../assets/screens/onboarding/onboarding2.png');
export const ONBOARDING_3 = require('../../assets/screens/onboarding/onboarding3.png');

export const ONBOARDING_IMAGES = [ONBOARDING_1, ONBOARDING_2, ONBOARDING_3];

let prefetched = false;

/**
 * Prime the native image pipeline with all onboarding illustrations so they
 * are already decoded and cached in memory when the user swipes.
 */
export function prefetchOnboardingImages() {
  if (prefetched) return;
  prefetched = true;

  ONBOARDING_IMAGES.forEach((asset) => {
    try {
      const source = Image.resolveAssetSource(asset);
      if (source?.uri) {
        Image.prefetch(source.uri).catch(() => {});
      }
    } catch {
      // Ignore in mock/headless environments
    }
  });
}

// Prefetch immediately on module load if onboarding is bundled
prefetchOnboardingImages();

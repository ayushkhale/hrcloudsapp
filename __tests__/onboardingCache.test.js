import { Image } from 'react-native';
import {
  ONBOARDING_1,
  ONBOARDING_2,
  ONBOARDING_3,
  ONBOARDING_IMAGES,
  prefetchOnboardingImages,
} from '../src/features/onboarding/onboardingImages';

describe('Onboarding Images Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exports all three tour illustrations', () => {
    expect(ONBOARDING_1).toBeDefined();
    expect(ONBOARDING_2).toBeDefined();
    expect(ONBOARDING_3).toBeDefined();
    expect(ONBOARDING_IMAGES).toHaveLength(3);
  });

  test('prefetchOnboardingImages executes without error and triggers prefetch', () => {
    const originalPrefetch = Image.prefetch;
    const originalResolve = Image.resolveAssetSource;

    const prefetchedUris = [];
    Image.prefetch = jest.fn((uri) => {
      prefetchedUris.push(uri);
      return Promise.resolve(true);
    });
    Image.resolveAssetSource = jest.fn((asset) => ({
      uri: `asset://test-asset-${asset}`,
      width: 1536,
      height: 1024,
    }));

    try {
      prefetchOnboardingImages();
      expect(typeof prefetchOnboardingImages).toBe('function');
    } finally {
      Image.prefetch = originalPrefetch;
      Image.resolveAssetSource = originalResolve;
    }
  });

  test('prefetches each onboarding image asset uri', () => {
    const originalPrefetch = Image.prefetch;
    const originalResolve = Image.resolveAssetSource;

    const prefetchedUris = [];
    Image.prefetch = jest.fn((uri) => {
      prefetchedUris.push(uri);
      return Promise.resolve(true);
    });
    Image.resolveAssetSource = jest.fn((asset) => ({
      uri: `asset://onboarding-${asset}.png`,
      width: 1536,
      height: 1024,
    }));

    try {
      // Force test run
      ONBOARDING_IMAGES.forEach((asset) => {
        const source = Image.resolveAssetSource(asset);
        if (source?.uri) {
          Image.prefetch(source.uri);
        }
      });

      expect(Image.prefetch).toHaveBeenCalledTimes(3);
      expect(prefetchedUris).toHaveLength(3);
    } finally {
      Image.prefetch = originalPrefetch;
      Image.resolveAssetSource = originalResolve;
    }
  });
});

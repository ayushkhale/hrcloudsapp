import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingNavigation = null;

/**
 * Navigate directly to the Location Checks section of My Time.
 * If the navigation container is not ready yet (e.g. cold start),
 * queues the navigation until ready.
 */
export function navigateToLocationChecks() {
  const perform = () => {
    try {
      if (navigationRef.isReady()) {
        navigationRef.navigate('TimeTab', {
          screen: 'Time',
          params: { section: 'locationChecks' },
        });
        return true;
      }
      return false;
    } catch (err) {
      if (__DEV__) console.warn('[navigation] navigateToLocationChecks failed:', err?.message || err);
      return false;
    }
  };

  if (perform()) return;

  pendingNavigation = perform;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (navigationRef.isReady()) {
      clearInterval(timer);
      if (pendingNavigation) {
        pendingNavigation();
        pendingNavigation = null;
      }
    } else if (attempts > 60) {
      clearInterval(timer);
      pendingNavigation = null;
    }
  }, 100);
}

/**
 * Flush any queued navigation once navigation container or auth hydrates.
 */
export function flushPendingNavigation() {
  if (pendingNavigation && navigationRef.isReady()) {
    const fn = pendingNavigation;
    pendingNavigation = null;
    fn();
  }
}

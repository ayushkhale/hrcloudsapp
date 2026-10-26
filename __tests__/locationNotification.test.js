jest.mock('../src/state/AuthContext', () => ({
  useAuth: () => ({ workspace: 'employee' }),
}));

jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({
    isReady: jest.fn().mockReturnValue(true),
    navigate: jest.fn(),
  }),
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('react-native-config', () => ({
  API_URL: 'https://test.api',
}));

jest.mock('@react-native-firebase/messaging', () => () => ({
  requestPermission: jest.fn().mockResolvedValue(1),
  registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(true),
  getToken: jest.fn().mockResolvedValue('fake-token'),
  onTokenRefresh: jest.fn().mockReturnValue(jest.fn()),
  onMessage: jest.fn().mockReturnValue(jest.fn()),
  onNotificationOpenedApp: jest.fn().mockReturnValue(jest.fn()),
  getInitialNotification: jest.fn().mockResolvedValue(null),
  setBackgroundMessageHandler: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

jest.mock('react-native-blob-util', () => ({
  fs: { dirs: { DocumentDir: '/mock' } },
}));
jest.mock('react-native-file-viewer', () => ({}));
jest.mock('react-native-share', () => ({}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn().mockResolvedValue('attendance_location_channel'),
    displayNotification: jest.fn().mockResolvedValue('notif-id'),
    onForegroundEvent: jest.fn().mockReturnValue(jest.fn()),
    getInitialNotification: jest.fn().mockResolvedValue(null),
    onBackgroundEvent: jest.fn(),
  },
  AndroidImportance: { HIGH: 4 },
  EventType: { PRESS: 1 },
}));

jest.mock('../src/ui/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('../src/features/notifications/pushDevice', () => ({
  registerThisDevice: jest.fn(),
  deregisterThisDevice: jest.fn(),
}));

jest.mock('../src/features/attendance/liveLocation', () => ({
  handleLocationRequest: jest.fn(),
  isLocationRequest: jest.fn(),
}));

import { isLocationNotification } from '../src/features/notifications/push';
import { ROUTES } from '../src/navigation/routes';
import { navigationRef, navigateToLocationChecks, flushPendingNavigation } from '../src/navigation/navigationRef';
import { ATTENDANCE_EVENTS } from '../src/lib/events';

describe('Location Fetched Notification & Redirection', () => {
  describe('isLocationNotification', () => {
    it('identifies notification by data.type = "location_check"', () => {
      expect(isLocationNotification({ type: 'location_check' }, null)).toBe(true);
    });

    it('identifies notification by data.section = "locationChecks"', () => {
      expect(isLocationNotification({ section: 'locationChecks' }, null)).toBe(true);
    });

    it('identifies notification by data.action = "REQUEST_LOCATION"', () => {
      expect(isLocationNotification({ action: 'REQUEST_LOCATION' }, null)).toBe(true);
    });

    it('identifies notification by title containing "Location fetched"', () => {
      expect(isLocationNotification(null, { title: 'Location fetched', body: 'Your location was verified.' })).toBe(true);
    });

    it('identifies notification by title containing "Location requested"', () => {
      expect(isLocationNotification(null, { title: 'Location requested', body: 'Workplace requested location.' })).toBe(true);
    });

    it('identifies notification by body containing "location"', () => {
      expect(isLocationNotification(null, { title: 'Alert', body: 'Your live location has been sent.' })).toBe(true);
    });

    it('returns false for unrelated notifications', () => {
      expect(isLocationNotification({ type: 'payslip' }, { title: 'Payslip ready', body: 'Your payslip for Sep is here.' })).toBe(false);
      expect(isLocationNotification(null, null)).toBe(false);
    });
  });

  describe('Route and Event Configuration', () => {
    it('registers locationChecks in ROUTES.employee', () => {
      expect(ROUTES.employee.locationChecks).toEqual(['TimeTab', 'Time', { section: 'locationChecks' }]);
    });

    it('defines ATTENDANCE_EVENTS.LOCATION_CHECK', () => {
      expect(ATTENDANCE_EVENTS.LOCATION_CHECK).toBe('location_check');
    });
  });

  describe('navigateToLocationChecks', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('navigates to TimeTab with section: locationChecks when ready', () => {
      const isReadySpy = jest.spyOn(navigationRef, 'isReady').mockReturnValue(true);
      const navigateSpy = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {});

      navigateToLocationChecks();

      expect(isReadySpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith('TimeTab', {
        screen: 'Time',
        params: { section: 'locationChecks' },
      });
    });

    it('flushes queued navigation when flushPendingNavigation is called after becoming ready', () => {
      let readyState = false;
      jest.spyOn(navigationRef, 'isReady').mockImplementation(() => readyState);
      const navigateSpy = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {});

      // Call while not ready
      navigateToLocationChecks();
      expect(navigateSpy).not.toHaveBeenCalled();

      // Ready now
      readyState = true;
      flushPendingNavigation();
      expect(navigateSpy).toHaveBeenCalledWith('TimeTab', {
        screen: 'Time',
        params: { section: 'locationChecks' },
      });
    });
  });
});

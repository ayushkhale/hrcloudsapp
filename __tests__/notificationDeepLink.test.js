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
    getParent: jest.fn(),
  }),
}));

jest.mock('../src/ui/Toast', () => ({
  showToast: jest.fn(),
}));

import {
  parseMetadata,
  resolveNotificationTarget,
  canNavigateNotification,
  navigateToTarget,
  navigateNotification,
} from '../src/features/notifications/deepLink';
import { navigationRef } from '../src/navigation/navigationRef';

describe('Notification Deep Linking & Details Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseMetadata', () => {
    it('returns empty object for falsy metadata', () => {
      expect(parseMetadata(null)).toEqual({});
      expect(parseMetadata(undefined)).toEqual({});
      expect(parseMetadata('')).toEqual({});
    });

    it('returns object if already an object', () => {
      const meta = { screen: 'Leaves', id: '123' };
      expect(parseMetadata(meta)).toBe(meta);
    });

    it('parses valid JSON string', () => {
      const json = JSON.stringify({ screen: 'Payslip', id: 'abc' });
      expect(parseMetadata(json)).toEqual({ screen: 'Payslip', id: 'abc' });
    });

    it('returns empty object for invalid JSON string', () => {
      expect(parseMetadata('{ invalid json')).toEqual({});
    });
  });

  describe('resolveNotificationTarget', () => {
    it('resolves Leave notifications with various screen casings', () => {
      expect(resolveNotificationTarget({ metadata: { screen: 'LeaveRequestDetail' } }))
        .toEqual(['TimeTab', 'Time', { section: 'leave' }]);

      expect(resolveNotificationTarget({ metadata: { screen: 'leave_requests' } }))
        .toEqual(['TimeTab', 'Time', { section: 'leave' }]);

      expect(resolveNotificationTarget({ category: 'leave' }))
        .toEqual(['TimeTab', 'Time', { section: 'leave' }]);

      expect(resolveNotificationTarget({ event_key: 'leave.approved' }))
        .toEqual(['TimeTab', 'Time', { section: 'leave' }]);
    });

    it('resolves Attendance and Location Checks notifications', () => {
      expect(resolveNotificationTarget({ metadata: { screen: 'Regularization' } }))
        .toEqual(['TimeTab', 'Time', { section: 'corrections' }]);

      expect(resolveNotificationTarget({ metadata: { screen: 'location_checks' } }))
        .toEqual(['TimeTab', 'Time', { section: 'locationChecks' }]);

      expect(resolveNotificationTarget({ title: 'Location fetched by manager' }))
        .toEqual(['TimeTab', 'Time', { section: 'locationChecks' }]);

      expect(resolveNotificationTarget({ metadata: { screen: 'AttendanceAnomalies' } }))
        .toEqual(['TimeTab', 'Time', { section: 'flags' }]);

      expect(resolveNotificationTarget({ category: 'attendance' }))
        .toEqual(['TimeTab', 'Time', { section: 'attendance' }]);
    });

    it('resolves Payroll notifications', () => {
      expect(resolveNotificationTarget({ metadata: { screen: 'Payslip' } }))
        .toEqual(['PayTab', 'PayHome', { section: 'payslips' }]);

      expect(resolveNotificationTarget({ metadata: { screen: 'reimbursements' } }))
        .toEqual(['PayTab', 'PayHome', { section: 'claims' }]);

      expect(resolveNotificationTarget({ category: 'payroll' }))
        .toEqual(['PayTab', 'PayHome', { section: 'payslips' }]);

      expect(resolveNotificationTarget({ event_key: 'payroll.salary_revised' }))
        .toEqual(['PayTab', 'PayHome', { section: 'salary' }]);
    });

    it('resolves Tasks, Documents, and Schedules', () => {
      expect(resolveNotificationTarget({ metadata: { screen: 'TaskDetail', id: 't-1' } }))
        .toEqual(['HomeTab', 'TaskDetail', { task: { id: 't-1' } }]);

      expect(resolveNotificationTarget({ category: 'task' }))
        .toEqual(['HomeTab', 'MyTasks']);

      expect(resolveNotificationTarget({ category: 'document' }))
        .toEqual(['HomeTab', 'DocumentsHome', { section: 'personal' }]);

      expect(resolveNotificationTarget({ metadata: { screen: 'Schedules' } }))
        .toEqual(['SchedulesTab', 'Schedules']);
    });

    it('returns null for system/announcements with no target screen (button removed)', () => {
      expect(resolveNotificationTarget({ category: 'system', title: 'System Maintenance' }))
        .toBeNull();

      expect(resolveNotificationTarget({ category: 'system', message: 'Office closed tomorrow' }))
        .toBeNull();
    });

    it('returns null for unknown/unhandled targets', () => {
      expect(resolveNotificationTarget({ metadata: { screen: 'NonExistentScreen123' } }))
        .toBeNull();
    });
  });

  describe('canNavigateNotification', () => {
    it('returns true when a valid target exists', () => {
      expect(canNavigateNotification({ category: 'leave' })).toBe(true);
      expect(canNavigateNotification({ metadata: { screen: 'Payslip' } })).toBe(true);
    });

    it('returns false when no target exists so View details can be removed', () => {
      expect(canNavigateNotification({ category: 'system' })).toBe(false);
      expect(canNavigateNotification(null)).toBe(false);
      expect(canNavigateNotification({})).toBe(false);
    });
  });

  describe('navigateToTarget and navigateNotification', () => {
    it('prioritizes navigationRef.navigate for cross-tab jumps', () => {
      jest.spyOn(navigationRef, 'isReady').mockReturnValue(true);
      const navSpy = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {});

      const success = navigateToTarget(null, ['TimeTab', 'Time', { section: 'leave' }]);

      expect(success).toBe(true);
      expect(navSpy).toHaveBeenCalledWith('TimeTab', {
        screen: 'Time',
        params: { section: 'leave' },
      });
    });

    it('successfully navigates from notification object', () => {
      jest.spyOn(navigationRef, 'isReady').mockReturnValue(true);
      const navSpy = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {});

      const success = navigateNotification(null, {
        category: 'payroll',
        metadata: { screen: 'Payslip' },
      });

      expect(success).toBe(true);
      expect(navSpy).toHaveBeenCalledWith('PayTab', {
        screen: 'PayHome',
        params: { section: 'payslips' },
      });
    });

    it('returns false for notification without target', () => {
      const success = navigateNotification(null, { category: 'system' });
      expect(success).toBe(false);
    });
  });
});

jest.mock('react-native-config', () => ({
  GOOGLE_MAPS_API_KEY: 'test-google-maps-api-key',
}));

import { tone } from '../src/theme/tokens';
import { reverseGeocode } from '../src/lib/geocoding';

describe('Location Checks & Reverse Geocoding', () => {
  const sampleReportedItem = {
    request_id: '3982bf93-fc29-423d-8901-88520a31aa16',
    status: 'reported',
    created_at: '2026-10-23T23:33:51.160Z',
    fix_returned: true,
    location: {
      latitude: '22.69152390',
      longitude: '75.86531660',
      accuracy_meters: '100.00',
      captured_at: '2026-10-23T23:32:15.040Z',
      distance_meters: '285.00',
      in_bounds: true,
    },
    reason: 'Routine field location verification check',
    requested_by: '71639be3-1a97-4408-8bac-5b8039336755',
    requester_role: 'hr',
    responded_at: '2026-10-23T23:33:53.809Z',
  };

  const sampleNotSentItem = {
    request_id: '4509121a-1234-423d-8901-88520a31aa17',
    status: 'not_sent',
    created_at: '2026-10-23T21:10:00.000Z',
    fix_returned: false,
    reason: 'After hours check',
    requested_by: 'manager',
    requester_role: 'manager',
  };

  test('tone tokens provide emerald green for reported and warm amber for not sent', () => {
    // Reported green styling
    expect(tone.emerald.fg).toBe('#047857');
    expect(tone.emerald.dot).toBe('#10b981');
    expect(tone.emerald.bg).toBe('#ecfdf5');
    expect(tone.emerald.chip).toBe('#d1fae5');

    // Not sent amber styling
    expect(tone.amber.fg).toBe('#b45309');
    expect(tone.amber.dot).toBe('#f59e0b');
    expect(tone.amber.bg).toBe('#fffbeb');
    expect(tone.amber.chip).toBe('#fef3c7');
  });

  test('correctly extracts coordinates from backend payload format', () => {
    const lat = parseFloat(sampleReportedItem.location.latitude);
    const lng = parseFloat(sampleReportedItem.location.longitude);
    const accuracy = Math.round(Number(sampleReportedItem.location.accuracy_meters));

    expect(lat).toBeCloseTo(22.69152, 4);
    expect(lng).toBeCloseTo(75.86532, 4);
    expect(accuracy).toBe(100);
  });

  test('filters separate reported vs not_sent checks accurately', () => {
    const items = [sampleReportedItem, sampleNotSentItem];

    const reportedItems = items.filter((r) => r.status === 'reported' || r.fix_returned === true);
    const notSentItems = items.filter((r) => r.status === 'not_sent' || r.fix_returned === false);

    expect(reportedItems).toHaveLength(1);
    expect(reportedItems[0].request_id).toBe(sampleReportedItem.request_id);

    expect(notSentItems).toHaveLength(1);
    expect(notSentItems[0].request_id).toBe(sampleNotSentItem.request_id);
  });

  test('reverseGeocode handles numeric coordinates and caches result', async () => {
    const lat = 22.6915239;
    const lng = 75.8653166;

    // Mock fetch for Google Geocoding v4
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            formattedAddress: '31-35, Bhawarkua, Siddharth Nagar, Indore, Madhya Pradesh 452014, India',
            location: { latitude: 22.6915239, longitude: 75.8653166 },
            addressComponents: [
              { longText: 'Indore', types: ['locality'] },
              { longText: 'Madhya Pradesh', types: ['administrative_area_level_1'] },
              { longText: '452014', types: ['postal_code'] },
            ],
          },
        ],
      }),
    });

    try {
      const place = await reverseGeocode(lat, lng);
      expect(place).toBeDefined();
      expect(place.latitude).toBeCloseTo(22.69152, 4);
      expect(place.longitude).toBeCloseTo(75.86532, 4);
      expect(place.address).toContain('Indore');

      // Second call should return from memo without re-fetching
      const fetchCallsBefore = global.fetch.mock.calls.length;
      const cached = await reverseGeocode(lat, lng);
      expect(cached).toBe(place);
      expect(global.fetch.mock.calls.length).toBe(fetchCallsBefore);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('color object has slate, surfaceSubtle, emerald, and amber defined without throwing', () => {
    const { color } = require('../src/theme/tokens');
    expect(color.surfaceSubtle).toBeDefined();
    expect(typeof color.surfaceSubtle).toBe('string');
    expect(color.slate).toBeDefined();
    expect(color.slate[50]).toBe('#f8fafc');
    expect(color.emerald).toBeDefined();
    expect(color.amber).toBeDefined();
  });
});

// The device-proof canonical bytes against the guide's verified test vector
// (device_trust_frontend_guide.md §8.3). If this fails, every enforced punch
// fails with DEVICE_VERIFICATION_FAILED — do not "fix" the vector.
import { Buffer } from 'buffer';
import { createHash } from 'crypto';
import { canonicalProofBytes, toBase64, utf8Bytes } from '../src/features/devices/deviceProofBytes';

const VECTOR = {
  challenge_id: '3f1c9a7e-5b2d-4e8a-9c1f-0a7b6d4e2c88',
  challenge: 'k7Qx2Zr9vN1tH8sL4mJ6wP0yB3dF5gC7aE9iK2oU1xQ',
  operation: 'clock_in',
  device_id: 'b84d2c11-7e9f-4a30-8d6b-1f5c3a9e7042',
  user_id: '0c6e8b24-9a1d-4f7c-b3e5-62d8a4017f93',
  org_id: 'd51f7a68-3c2b-49e1-8a04-7b9e6d2c5318',
};

test('reproduces the published vector', () => {
  const bytes = canonicalProofBytes(VECTOR);
  expect(bytes.length).toBe(244);
  expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex'))
    .toBe('e44145702f266eb5819c17ead9865f7f0361b55c77cb220082b9c811e516f9c3');
  expect(Buffer.from(bytes.slice(0, 48)).toString('hex'))
    .toBe('48524d532d4154544e2d4445564943452d50524f4f462d76310000002433663163396137652d356232642d346538612d');
});

test('base64 matches Node', () => {
  const bytes = canonicalProofBytes(VECTOR);
  expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  for (const n of [0, 1, 2, 3, 4, 5]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 97) & 255);
    expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
  }
});

test('UTF-8 matches Node, including non-ASCII', () => {
  for (const s of ['abc', 'é', '’', '日本', '😀']) {
    expect(Buffer.from(utf8Bytes(s)).toString('hex')).toBe(Buffer.from(s, 'utf8').toString('hex'));
  }
});

test('refuses a missing field', () => {
  expect(() => canonicalProofBytes({ ...VECTOR, org_id: '' })).toThrow(/org_id/);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { randomUUID } = vi.hoisted(() => ({ randomUUID: vi.fn() }));

vi.mock('expo-crypto', () => ({ randomUUID }));

import { ExpoChildIdGenerator } from './expo-child-id-generator';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('ExpoChildIdGenerator', () => {
  beforeEach(() => {
    randomUUID.mockReset();
  });

  it('generates opaque UUIDv4 identifiers', () => {
    randomUUID.mockReturnValue('6ba7b810-9dad-4d80-80b4-00c04fd430c8');
    const generator = new ExpoChildIdGenerator();

    expect(generator.generate()).toMatch(UUID_V4_PATTERN);
  });

  it('generates a different identifier on repeated calls', () => {
    randomUUID
      .mockReturnValueOnce('6ba7b810-9dad-4d80-80b4-00c04fd430c8')
      .mockReturnValueOnce('6ba7b811-9dad-4d80-80b4-00c04fd430c8');
    const generator = new ExpoChildIdGenerator();

    expect(generator.generate()).not.toBe(generator.generate());
  });
});

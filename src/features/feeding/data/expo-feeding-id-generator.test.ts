import { beforeEach, describe, expect, it, vi } from 'vitest';

const randomUUID = vi.hoisted(() => vi.fn());
vi.mock('expo-crypto', () => ({ randomUUID }));

import { ExpoFeedingIdGenerator } from './expo-feeding-id-generator';

describe('ExpoFeedingIdGenerator', () => {
  beforeEach(() => randomUUID.mockReset());

  it('uses the native random UUID generator', () => {
    randomUUID.mockReturnValue('native-feeding-uuid');
    expect(new ExpoFeedingIdGenerator().generate()).toBe('native-feeding-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});

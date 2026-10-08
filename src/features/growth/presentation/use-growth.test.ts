import { describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  focusEffect: undefined as undefined | (() => () => void), app: undefined as undefined | ((state: string) => void),
  focus: vi.fn(), refresh: vi.fn(), leave: vi.fn(), remove: vi.fn(),
}));
vi.mock('react', () => ({
  createContext: () => ({}), useContext: () => ({ controller: { focus: h.focus, refresh: h.refresh }, state: {} }),
  useCallback: (callback: unknown) => callback, useEffect: () => {}, useMemo: (factory: () => unknown) => factory(), useState: () => [],
}));
vi.mock('expo-router', () => ({ useFocusEffect: (effect: () => () => void) => { h.focusEffect = effect; } }));
vi.mock('react-native', () => ({ AppState: { addEventListener: (_event: string, next: (state: string) => void) => {
  h.app = next; return { remove: h.remove };
} } }));
vi.mock('@/runtime/app-runtime-provider', () => ({ useChildrenRuntime: () => ({}), useGrowthRuntime: () => ({}) }));
import { useGrowth } from './use-growth';

describe('Growth focus and resume integration', () => {
  it('refreshes on focus and foreground and removes the listener on blur', () => {
    h.focus.mockReturnValue(h.leave);
    useGrowth(); const cleanup = h.focusEffect!();
    expect(h.focus).toHaveBeenCalledTimes(1);
    h.app!('background'); expect(h.refresh).not.toHaveBeenCalled();
    h.app!('active'); expect(h.refresh).toHaveBeenCalledTimes(1);
    cleanup(); expect(h.leave).toHaveBeenCalledTimes(1); expect(h.remove).toHaveBeenCalledTimes(1);
  });
});

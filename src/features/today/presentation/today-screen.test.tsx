import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { sv } from '../../../i18n/locales/sv';
import { todayFixture } from './today-test-fixture';
import type { TodayState } from './today-controller';
const harness = vi.hoisted(() => ({
  width: 360, fontScale: 1, inset: 0,
  state: { status: 'loading' } as TodayState,
  now: Date.parse('2026-10-07T12:00:00Z'),
  retry: vi.fn(), bootstrap: vi.fn(), push: vi.fn(),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void) => { effect(); },
}));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  useWindowDimensions: () => ({ width: harness.width, fontScale: harness.fontScale }),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ left: harness.inset, right: harness.inset, top: 0, bottom: 0 }),
}));
vi.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: harness.push }) }));
const i18n = createInstance();
await i18n.init({ lng: 'sv', resources: { sv: { translation: sv } }, initAsync: false });
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t }) }));
vi.mock('./use-today-summary', () => ({
  useTodaySummary: () => ({ state: harness.state, now: harness.now, retry: harness.retry }),
}));
vi.mock('../../children/presentation/child-bootstrap-gate', () => ({
  useChildBootstrap: () => ({ refreshBootstrap: harness.bootstrap }),
}));
vi.mock('@/components/ui/app-text', () => import('../../../components/ui/app-text'));
vi.mock('@/components/ui/button', () => import('../../../components/ui/button'));
vi.mock('@/components/ui/card', () => import('../../../components/ui/card'));
vi.mock('@/components/ui/screen', () => import('../../../components/ui/screen'));
vi.mock('@/theme/tokens', () => import('../../../theme/tokens'));
import { TodayScreen } from './today-screen';
import { lightColors } from '../../../theme/tokens';
// Tests expand the real shared primitives into native host elements without a renderer dependency.
type Host = { type: string; props: Record<string, any>; text: string };
function expand(node: React.ReactNode): Host[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node === 'string' || typeof node === 'number') return [{ type: '#text', props: {}, text: String(node) }];
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, any>>;
  if (typeof element.type === 'function') {
    return expand((element.type as (props: any) => React.ReactNode)(element.props));
  }
  return [{ type: String(element.type), props: element.props, text: '' }, ...expand(element.props.children)];
}
function render() { return expand(TodayScreen()); }
function text(nodes: Host[]) { return nodes.map(node => node.text).join(' '); }
beforeEach(() => {
  vi.stubGlobal('React', React);
  harness.width = 360; harness.fontScale = 1; harness.inset = 0;
  harness.state = { status: 'ready', summary: todayFixture() };
  harness.now = Date.parse('2026-10-07T12:00:00Z');
  harness.retry.mockClear(); harness.bootstrap.mockClear(); harness.push.mockClear();
});
describe('Today dashboard native component contract', () => {
  it('shows the canonical child, calendar age, local date, counts and all-time labels', () => {
    const output = text(render());
    for (const value of ['Mio', '2 år och 7 månader', 'onsdag 7 oktober 2026',
      'Dagens översikt', '3', '4', '2 tim 3 min', 'Sömn', 'Pågående sömn ingår inte',
      'Idag kl. 10:00', 'Igår kl. 10:00', 'Snabblogga']) expect(output).toContain(value);
    expect(output).not.toContain('Sömn pågår');
    expect(output).not.toContain('Just nu');
  });
  it('represents empty data with actual zero totals and absent timestamps', () => {
    const summary = todayFixture();
    harness.state = { status: 'ready', summary: { ...summary,
      feeding: { dayCount: 0, latestCompletedAtEpochMs: null },
      diapers: { dayCount: 0, latestOccurredAtEpochMs: null },
      sleep: { completedDurationMs: 0, active: null },
    } };
    expect(text(render())).toContain('0 min');
    expect(text(render()).split('Inget registrerat ännu')).toHaveLength(3);
  });
  it('shows ongoing sleep separately using the domain helper and safely handles rollback', () => {
    const summary = todayFixture();
    harness.state = { status: 'ready', summary: { ...summary,
      sleep: { ...summary.sleep, active: {
        session: { id: 'active', childId: 'mio', startedAtEpochMs: harness.now + 1000 },
        elapsedMs: 0, clockMovedBackward: true,
      } },
    } };
    expect(text(render())).toContain('Sömn pågår');
    expect(text(render())).toContain('00:00:00');
    expect(text(render())).toContain('Klockan har ändrats');
    harness.now += 3_662_000;
    expect(text(render())).toContain('01:01:01');
    expect(text(render())).not.toContain('Klockan har ändrats');
  });
  it('uses accessible icon actions and protected feature routes', () => {
    const buttons = render().filter(node => node.type === 'Pressable');
    expect(buttons).toHaveLength(3);
    buttons.forEach(button => {
      expect(button.props.accessibilityRole).toBe('button');
      const styles = button.props.style({ pressed: false }).flat();
      expect(styles.some((style: any) => style?.minHeight >= 48)).toBe(true);
      button.props.onPress();
    });
    expect(harness.push.mock.calls).toEqual([['/feeding'], ['/sleep'], ['/diapers']]);
    expect(buttons.map(button => button.props.accessibilityLabel)).toEqual(['Matning', 'Sömn', 'Blöja']);
    const labels = buttons.flatMap(button => expand(button.props.children)).filter(node => node.type === 'Text');
    expect(labels).toHaveLength(3);
    labels.forEach(label => expect(label.props.style.flat(Infinity).some(
      (style: any) => style?.alignSelf === 'stretch' && style?.textAlign === 'center',
    )).toBe(true));
  });
  it('shows initial loading without zeros or recording actions', () => {
    harness.state = { status: 'loading' };
    const nodes = render();
    expect(nodes.some(node => node.type === 'ActivityIndicator')).toBe(true);
    expect(text(nodes)).not.toContain('Dagens översikt');
    expect(nodes.some(node => node.type === 'Pressable')).toBe(false);
  });
  it('shows safe error and retry without stale child or misleading totals', () => {
    harness.state = { status: 'error' };
    const nodes = render();
    expect(text(nodes)).not.toContain('Mio');
    expect(text(nodes)).not.toContain('Dagens översikt');
    expect(text(nodes)).not.toMatch(/SQLite|SQLCipher|secret/);
    nodes.find(node => node.type === 'Pressable')!.props.onPress();
    expect(harness.retry).toHaveBeenCalledOnce();
  });
  it('delegates missing-child recovery to bootstrap', () => {
    harness.state = { status: 'missing' };
    const nodes = render();
    expect(harness.bootstrap).toHaveBeenCalledOnce();
    expect(harness.push).not.toHaveBeenCalled();
    nodes.find(node => node.type === 'Pressable')!.props.onPress();
    expect(harness.bootstrap).toHaveBeenCalledTimes(2);
  });
});

describe('Today visual redesign layout contract', () => {
  it('renders three distinct canonical statistic cards with equal-height row layout', () => {
    const nodes = render();
    const cards = nodes.filter(node => String(node.props.testID ?? '').startsWith('today-stat-'));
    expect(cards.map(card => card.props.testID)).toEqual([
      'today-stat-feeding', 'today-stat-sleep', 'today-stat-diapers',
    ]);
    expect(cards.map(card => card.props.accessibilityLabel)).toEqual([
      'Matningar: 3', 'Sömn: 2 tim 3 min', 'Blöjor: 4',
    ]);
    const backgrounds = cards.map(card => card.props.style.flat(Infinity)
      .filter((style: any) => style?.backgroundColor).at(-1).backgroundColor);
    expect(backgrounds).toEqual([lightColors.accentSage, lightColors.accentBlue, lightColors.accentPeach]);
    const group = nodes.find(node => node.props.testID === 'today-statistics')!;
    expect(group.props.style.flat().some((style: any) =>
      style?.flexDirection === 'row' && style?.alignItems === 'stretch')).toBe(true);
    cards.forEach(card => {
      const styles = card.props.style.flat(Infinity);
      expect(styles.some((style: any) => style?.flex === 1)).toBe(true);
      expect(styles.some((style: any) => style?.height !== undefined)).toBe(false);
    });
  });
  it.each([
    [360, 1, 0, true],
    [320, 1, 0, false],
    [360, 1.6, 0, false],
    [800, 2, 0, true],
    [360, 1, 20, false],
    [280, 2.5, 0, false],
  ])('responds at width %i, text scale %f and safe inset %i', (width, fontScale, inset, row) => {
    harness.width = width; harness.fontScale = fontScale; harness.inset = inset;
    const nodes = render();
    for (const id of ['today-statistics', 'today-quick-actions']) {
      const group = nodes.find(node => node.props.testID === id)!;
      expect(group.props.style.flat().some((style: any) => style?.flexDirection === 'row')).toBe(row);
    }
    nodes.filter(node => node.type === 'Text').forEach(node => {
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.adjustsFontSizeToFit).toBeUndefined();
      expect(node.props.allowFontScaling).not.toBe(false);
    });
  });
  it('falls back for large counts and keeps every digit', () => {
    const summary = todayFixture();
    harness.state = { status: 'ready', summary: {
      ...summary, feeding: { ...summary.feeding, dayCount: 123456789 },
    } };
    const nodes = render();
    expect(text(nodes)).toContain('123456789');
    const group = nodes.find(node => node.props.testID === 'today-statistics')!;
    expect(group.props.style.flat().some((style: any) => style?.flexDirection === 'row')).toBe(false);
  });
  it('uses singular feeding wording and preserves all-time date context in event rows', () => {
    const summary = todayFixture();
    harness.state = { status: 'ready', summary: { ...summary,
      feeding: { dayCount: 1, latestCompletedAtEpochMs: Date.parse('2025-10-05T08:00:00Z') },
    } };
    const nodes = render();
    expect(nodes.find(node => node.props.testID === 'today-stat-feeding')!.props.accessibilityLabel).toBe('Matning: 1');
    expect(text(nodes)).toContain('5 okt. 2025 kl. 10:00');
  });
  it('uses native cross-platform icons and hides decorative symbols from accessibility', () => {
    const nodes = render();
    const symbols = nodes.filter(node => node.type === 'SymbolView');
    expect(symbols).toHaveLength(8);
    symbols.forEach(symbol => {
      expect(symbol.props.name.ios).toBeTruthy();
      expect(symbol.props.name.android).toBeTruthy();
      expect(symbol.props.name.web).toBeTruthy();
    });
    expect(symbols.some(symbol => symbol.props.name.android === 'bedtime')).toBe(true);
    const hidden = nodes.filter(node => node.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden).toHaveLength(8);
    hidden.forEach(node => expect(node.props.accessibilityElementsHidden).toBe(true));
  });
  it('preserves completed totals while showing active sleep separately', () => {
    const summary = todayFixture();
    harness.state = { status: 'ready', summary: { ...summary, sleep: { ...summary.sleep, active: {
      session: { id: 'sleep', childId: 'mio', startedAtEpochMs: harness.now - 3_600_000 },
      elapsedMs: 3_600_000, clockMovedBackward: false,
    } } } };
    const nodes = render();
    expect(nodes.find(node => node.props.testID === 'today-stat-sleep')!.props.accessibilityLabel).toBe('Sömn: 2 tim 3 min');
    expect(text(nodes)).toContain('01:00:00');
    expect(text(nodes)).toContain('Pågående sömn ingår inte i dagens totalsumma.');
  });
});

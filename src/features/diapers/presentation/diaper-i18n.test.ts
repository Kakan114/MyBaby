import { describe, expect, it } from 'vitest';
import { sv } from '../../../i18n/locales/sv';

describe('Diaper Swedish copy', () => {
  it('defines every dynamic kind and safety message used by presentation', () => {
    expect(sv.diapers.kind).toEqual({ wet: 'Våt', dirty: 'Bajs', mixed: 'Våt + bajs' });
    expect(sv.diapers.success).toEqual({
      wet: 'Våt registrerad.',
      dirty: 'Bajs registrerad.',
      mixed: 'Våt + bajs registrerad.',
    });
    expect(sv.diapers.manual.errors.future).toBe('Du kan inte välja en tid i framtiden.');
    expect(sv.diapers.undo.action).toBe('Ångra');
    expect(sv.diapers.notice.updated).toBe('Blöjan har uppdaterats.');
    expect(sv.diapers.notice.deleted).toBe('Blöjan har tagits bort.');
    expect(sv.diapers.correction.delete.confirm).toBe('Ta bort');
    expect(sv.diapers.history.open).toBe('Visa blöjhistorik');
    expect(sv.diapers.history.title).toBe('Blöjhistorik');
    expect(sv.diapers.uncertain.description).not.toMatch(/SQLite|SQLCipher|database|diaper\./i);
  });
});

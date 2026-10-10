import { describe, expect, it } from 'vitest';
import {
  isMilestoneDefinitionId,
  milestoneCategories,
  milestoneDefinitionIds,
  milestoneDefinitions,
} from './milestone-catalog';

const expectedIds = [
  'social.first-smile',
  'social.first-laugh',
  'motor.rolls-over',
  'motor.sits-independently',
  'motor.crawls',
  'motor.pulls-to-stand',
  'motor.first-steps',
  'communication.babbles',
  'communication.waves',
  'communication.first-word',
  'everyday.first-taste',
  'everyday.drinks-from-cup',
  'teeth.first-tooth',
] as const;

describe('Milestone catalog', () => {
  it('contains every permanent definition ID exactly once', () => {
    expect(milestoneDefinitionIds).toEqual(expectedIds);
    expect(milestoneDefinitions.map(({ id }) => id)).toEqual(expectedIds);
    expect(new Set(milestoneDefinitionIds).size).toBe(milestoneDefinitionIds.length);
  });

  it('uses only valid categories and language-neutral i18n keys', () => {
    const validCategories = new Set<string>(milestoneCategories);
    for (const definition of milestoneDefinitions) {
      expect(validCategories.has(definition.category)).toBe(true);
      expect(definition.titleKey).toBe(`milestones.catalog.${definition.id}`);
    }
  });

  it('recognizes only catalogued definition IDs', () => {
    for (const id of expectedIds) expect(isMilestoneDefinitionId(id)).toBe(true);
    expect(isMilestoneDefinitionId('motor.unknown')).toBe(false);
    expect(isMilestoneDefinitionId('Första leendet')).toBe(false);
  });

  it('freezes the catalog and every definition', () => {
    expect(Object.isFrozen(milestoneCategories)).toBe(true);
    expect(Object.isFrozen(milestoneDefinitionIds)).toBe(true);
    expect(Object.isFrozen(milestoneDefinitions)).toBe(true);
    for (const definition of milestoneDefinitions) expect(Object.isFrozen(definition)).toBe(true);
  });

  it('contains no expected-age, deadline, scoring, or medical metadata', () => {
    const forbidden = /age|month|week|deadline|expected|normal|abnormal|score|medical|diagnos/i;
    for (const definition of milestoneDefinitions) {
      expect(Object.keys(definition).some((key) => forbidden.test(key))).toBe(false);
      expect(Object.keys(definition).sort()).toEqual(['category', 'id', 'titleKey']);
    }
  });
});


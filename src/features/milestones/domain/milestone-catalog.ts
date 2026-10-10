export const milestoneCategories = Object.freeze([
  'social',
  'motor',
  'communication',
  'everyday',
  'teeth',
] as const);

export type MilestoneCategory = (typeof milestoneCategories)[number];

export const milestoneDefinitionIds = Object.freeze([
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
] as const);

export type MilestoneDefinitionId = (typeof milestoneDefinitionIds)[number];

export type MilestoneDefinition = Readonly<{
  id: MilestoneDefinitionId;
  category: MilestoneCategory;
  titleKey: `milestones.catalog.${MilestoneDefinitionId}`;
}>;

const definitionInputs: readonly Readonly<{
  id: MilestoneDefinitionId;
  category: MilestoneCategory;
}>[] = [
  { id: 'social.first-smile', category: 'social' },
  { id: 'social.first-laugh', category: 'social' },
  { id: 'motor.rolls-over', category: 'motor' },
  { id: 'motor.sits-independently', category: 'motor' },
  { id: 'motor.crawls', category: 'motor' },
  { id: 'motor.pulls-to-stand', category: 'motor' },
  { id: 'motor.first-steps', category: 'motor' },
  { id: 'communication.babbles', category: 'communication' },
  { id: 'communication.waves', category: 'communication' },
  { id: 'communication.first-word', category: 'communication' },
  { id: 'everyday.first-taste', category: 'everyday' },
  { id: 'everyday.drinks-from-cup', category: 'everyday' },
  { id: 'teeth.first-tooth', category: 'teeth' },
];

/** Stable persisted identifiers. Existing IDs must never be repurposed or removed. */
export const milestoneDefinitions: readonly MilestoneDefinition[] = Object.freeze(
  definitionInputs.map((definition) => Object.freeze({
    ...definition,
    titleKey: `milestones.catalog.${definition.id}` as const,
  })),
);

const milestoneDefinitionIdSet: ReadonlySet<string> = new Set(milestoneDefinitionIds);

export function isMilestoneDefinitionId(value: string): value is MilestoneDefinitionId {
  return milestoneDefinitionIdSet.has(value);
}


import { getActiveChild } from './active-child';
import type { ActiveChildRepository } from './active-child-repository';
import type { ChildRepository } from './child-repository';

export type ChildrenBootstrapStatus =
  | Readonly<{ status: 'ready' }>
  | Readonly<{ status: 'onboarding-required' }>
  | Readonly<{ status: 'active-selection-required' }>;

export type GetChildrenBootstrapStatusDependencies = Readonly<{
  activeChildRepository: ActiveChildRepository;
  childRepository: ChildRepository;
}>;

const READY = { status: 'ready' } as const;
const ONBOARDING_REQUIRED = { status: 'onboarding-required' } as const;
const ACTIVE_SELECTION_REQUIRED = {
  status: 'active-selection-required',
} as const;

export async function getChildrenBootstrapStatus(
  dependencies: GetChildrenBootstrapStatusDependencies,
): Promise<ChildrenBootstrapStatus> {
  const activeChild = await getActiveChild(dependencies);

  if (activeChild !== null) {
    return READY;
  }

  return (await dependencies.childRepository.hasChildren())
    ? ACTIVE_SELECTION_REQUIRED
    : ONBOARDING_REQUIRED;
}

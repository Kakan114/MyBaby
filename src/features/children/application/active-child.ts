import type { Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
import type { ChildRepository } from './child-repository';

export type ActiveChildErrorCode = 'child-not-found';

export class ActiveChildError extends Error {
  constructor(readonly code: ActiveChildErrorCode) {
    super('The selected child does not exist.');
    this.name = 'ActiveChildError';
  }
}

export type ActiveChildDependencies = Readonly<{
  activeChildRepository: ActiveChildRepository;
  childRepository: ChildRepository;
}>;

export async function getActiveChild(
  dependencies: ActiveChildDependencies,
): Promise<Child | null> {
  const activeChildId = await dependencies.activeChildRepository.getActiveChildId();

  if (activeChildId === null) {
    return null;
  }

  const child = await dependencies.childRepository.getById(activeChildId);

  if (child === null) {
    await dependencies.activeChildRepository.clearActiveChildIdIfMatches(
      activeChildId,
    );
    return null;
  }

  return child;
}

export async function setActiveChild(
  dependencies: ActiveChildDependencies,
  id: string,
): Promise<Child> {
  const child = await dependencies.childRepository.getById(id);

  if (child === null) {
    throw new ActiveChildError('child-not-found');
  }

  await dependencies.activeChildRepository.setActiveChildId(id);
  return child;
}

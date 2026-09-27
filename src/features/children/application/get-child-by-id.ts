import type { Child } from '../domain/child';
import type { ChildRepository } from './child-repository';

export function getChildById(
  childRepository: ChildRepository,
  id: string,
): Promise<Child | null> {
  return childRepository.getById(id);
}

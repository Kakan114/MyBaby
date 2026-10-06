import type { Child } from '../domain/child';
import type { ChildRepository } from './child-repository';

export function listChildren(
  repository: ChildRepository,
): Promise<readonly Child[]> {
  return repository.listChildren();
}

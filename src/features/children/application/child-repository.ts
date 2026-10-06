import type { Child } from '../domain/child';

export interface ChildRepository {
  getById(id: string): Promise<Child | null>;
  hasChildren(): Promise<boolean>;
  /** Newest date of birth first, with ascending ID as the stable tie-breaker. */
  listChildren(): Promise<readonly Child[]>;
  save(child: Child): Promise<void>;
}

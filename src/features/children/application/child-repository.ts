import type { Child } from '../domain/child';

export interface ChildRepository {
  getById(id: string): Promise<Child | null>;
  save(child: Child): Promise<void>;
}

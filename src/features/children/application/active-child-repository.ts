export interface ActiveChildRepository {
  getActiveChildId(): Promise<string | null>;
  setActiveChildId(id: string): Promise<void>;
  setActiveChildIdIfUnset(id: string): Promise<void>;
  clearActiveChildIdIfMatches(id: string): Promise<void>;
}

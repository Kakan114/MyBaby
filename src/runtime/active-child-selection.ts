/** Neutral selection invalidation shared by feature runtimes; no presentation dependency. */
export type ActiveChildContext = Readonly<{ childId: string; selectionVersion: number; selectionScope: object }>;
export type ActiveChildSelection = Readonly<{
  readonly scope: object;
  getVersion(): number;
  isChanging(): boolean;
  subscribe(listener: (switching: boolean) => void): () => void;
}>;

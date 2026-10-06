declare module 'node:sqlite' {
  export class StatementSync {
    all(...values: (string | number | bigint | null | Uint8Array)[]): unknown[];
    get(...values: (string | number | bigint | null | Uint8Array)[]): unknown;
    run(...values: (string | number | bigint | null | Uint8Array)[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(source: string): void;
    prepare(source: string): StatementSync;
  }
}

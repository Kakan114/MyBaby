// Minimal Node test-only filesystem declarations; no production dependency.
declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string): void;
  export function rmdirSync(path: string): void;
}
declare module 'node:os' { export function tmpdir(): string; }
declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

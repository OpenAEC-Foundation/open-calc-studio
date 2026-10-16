import { Buffer } from 'buffer';
/** Static named import keeps CommonJS interop working in consumer bundlers. */
export function installBuffer(): void {
  const globals = globalThis as unknown as { Buffer?: typeof Buffer };
  globals.Buffer ??= Buffer;
}

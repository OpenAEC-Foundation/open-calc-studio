// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, matchesGlob, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Laad een configbestand uit de repo-root zonder dat tsc het in het src-project trekt. */
const rootModule = async <T,>(file: string): Promise<T> =>
  ((await import(/* @vite-ignore */ pathToFileURL(join(process.cwd(), file)).href)) as { default: T }).default;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]);
}

describe('test configuration', () => {
  it('Playwright only collects its own .spec.ts files, not Vitest files under tests/ (knownbug 251)', async () => {
    const config = await rootModule<{ testDir: string; testMatch?: string; testIgnore?: string }>('playwright.config.ts');
    expect(typeof config.testMatch).toBe('string');
    const testDir = join(process.cwd(), config.testDir);
    const collected = filesUnder(testDir).map((file) => relative(testDir, file).replace(/\\/g, '/'))
      .filter((file) => matchesGlob(file, config.testMatch!) && !(config.testIgnore && matchesGlob(file, `**/${config.testIgnore}`)));
    expect(collected).not.toContain('platform/hostedPolicy.test.tsx');
    expect(collected.length).toBeGreaterThan(0);
    expect(collected.every((file) => file.endsWith('.spec.ts'))).toBe(true);
  });

  it('the platform Vitest config keeps the shared timeouts (knownbug 277)', async () => {
    const application = await rootModule<{ test: { testTimeout: number; hookTimeout: number } }>('vite.config.ts');
    const platform = await rootModule<{ test: { testTimeout?: number; hookTimeout?: number; include: string[]; exclude?: string[] } }>('vitest.platform.config.ts');
    expect(platform.test.testTimeout).toBe(application.test.testTimeout);
    expect(platform.test.hookTimeout).toBe(application.test.hookTimeout);
    expect(platform.test.include).toEqual(['tests/platform/**/*.test.tsx']);
    // De app-config sluit tests/** uit; dat mag de platformtests niet wegfilteren.
    expect((platform.test.exclude ?? []).some((pattern) => matchesGlob('tests/platform/hostedPolicy.test.tsx', pattern))).toBe(false);
  });
});

describe('embed package (knownbug 254)', () => {
  it('does not declare packages that the library build bundles as dependencies', async () => {
    const { readFileSync } = await import('node:fs');
    const json = (file: string) => JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'));
    const embed = json('packages/embed/package.json');
    const root = json('package.json');
    for (const bundled of ['xlsx', 'mdb-reader', 'events', 'stream-browserify']) {
      expect(root.dependencies).toHaveProperty(bundled);
      expect(embed.dependencies).not.toHaveProperty(bundled);
    }
    // embed-sync en vite.lib.config delen één lijst; de gecommitte package.json volgt die.
    // @ts-expect-error -- .mjs-script zonder typedeclaratie
    const { embedDependencies } = await import('../../scripts/embed-bundled.mjs');
    expect(embed.dependencies).toEqual(embedDependencies(root.dependencies));
  });
});

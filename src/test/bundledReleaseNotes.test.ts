import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLED_RELEASES } from '@/components/welcome/ReleaseNotesPanel';

/**
 * "Wat is er nieuw" toont offline en in gehoste builds alleen de gebundelde lijst
 * (knownbug 233). Elke uitgebrachte versie met release notes hoort erin.
 */
describe('bundled release notes', () => {
  const tags = new Set(BUNDLED_RELEASES.map((release) => release.tag_name));

  it('include the current app version', () => {
    const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(tags).toContain(`v${version}`);
  });

  it('include every calendar release that has release notes', () => {
    const notes = readdirSync(join(process.cwd(), 'docs', 'release-notes'))
      .map((file) => /^(v20\d\d\.\d+\.\d+)\.md$/.exec(file)?.[1]).filter((tag): tag is string => !!tag);
    expect(notes.length).toBeGreaterThan(0);
    for (const tag of notes) expect(tags.has(tag) || tags.has(`${tag}-dev`), tag).toBe(true);
  });
});

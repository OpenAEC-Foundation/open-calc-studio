// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Zoals in het Docker-image: geen git beschikbaar.
vi.mock('node:child_process', () => ({ execFileSync: () => { throw new Error('spawn git ENOENT'); } }));

describe('build-info.json without git (knownbug 253)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('takes the commit from OCS_COMMIT, which the Dockerfile sets from REVISION', async () => {
    vi.stubEnv('OCS_COMMIT', '0123456789abcdef0123456789abcdef01234567');
    const { buildInfo } = await import('../../scripts/distribution-notices.mjs');
    expect(buildInfo('headless-api')).toMatchObject({ kind: 'headless-api', commit: '0123456789abcdef0123456789abcdef01234567', dirty: false });
  });

  it('stays unknown and dirty when nothing says which commit it is', async () => {
    vi.stubEnv('OCS_COMMIT', 'unknown');
    const { buildInfo } = await import('../../scripts/distribution-notices.mjs');
    expect(buildInfo('headless-api')).toMatchObject({ commit: 'unknown', dirty: true });
  });

  it('the Dockerfile passes REVISION into the build stage', () => {
    const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');
    const buildStage = dockerfile.split(/^FROM /m)[1];
    expect(buildStage).toMatch(/^ARG REVISION/m);
    expect(buildStage).toMatch(/OCS_COMMIT=\$REVISION/);
  });
});

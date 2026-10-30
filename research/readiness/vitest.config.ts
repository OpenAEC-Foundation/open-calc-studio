import { mergeConfig } from 'vitest/config';
import base from '../../vite.config';

// Explicit research run: observations are not product acceptance tests.
export default mergeConfig(base, {
  test: { include: ['research/readiness/first-four.probe.ts'], maxWorkers: 1 },
});

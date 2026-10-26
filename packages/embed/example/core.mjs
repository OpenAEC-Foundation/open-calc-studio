// node core.mjs /path/to/project.ocs (install the package in your project first)
import { readFile } from 'node:fs/promises';
import { deserializeProject, calculateProject, getStaartBreakdown } from '@openaec/open-calc-studio/core';
const path = process.argv[2];
if (!path) throw new Error('Usage: node core.mjs /path/to/project.ocs');
const project = deserializeProject(await readFile(path, 'utf8'));
console.log(JSON.stringify(getStaartBreakdown(calculateProject(project).items), null, 2));

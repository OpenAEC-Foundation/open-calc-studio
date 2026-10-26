#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = resolve(process.argv[2] || 'public/calc-studio');
await mkdir(destination, { recursive: true });
await cp(new URL('./dist/frame/', import.meta.url), destination, { recursive: true });
console.log(`Open Calc Studio frame copied to ${destination}`);

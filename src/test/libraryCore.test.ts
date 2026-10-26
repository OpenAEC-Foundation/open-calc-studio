// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateProject, deserializeProject, getStaartBreakdown } from '../lib/core';

describe('browser-independent library', () => {
  it('calculates a native project without DOM and preserves the source', () => {
    expect(typeof document).toBe('undefined');
    const project = deserializeProject(readFileSync('public/data/voorbeeld.ifcCalc', 'utf8'));
    const original = JSON.stringify(project);
    project.items.forEach(Object.freeze);
    Object.freeze(project.items);
    Object.freeze(project);
    const calculated = calculateProject(project);
    expect(JSON.stringify(project)).toBe(original);
    expect(calculated.items).not.toBe(project.items);
    expect(calculated.schedule).toBe(project.schedule);
    expect(getStaartBreakdown(calculated.items).aanneemsomAfgerond).toBeGreaterThan(0);
  });

  it('keeps a direct hourly rate when a tariff group has no production norm', () => {
    const project = deserializeProject(readFileSync('public/data/voorbeeld.ifcCalc', 'utf8'));
    project.schedule.tarieven = { A: 50, B: 43, C: 60 };
    const calculated = calculateProject(project);
    const labor = calculated.items.find(i => i.id === 'r02')!;
    expect(labor.laborPrice).toBe(60);
    expect(labor.total).toBe(840);
  });
});

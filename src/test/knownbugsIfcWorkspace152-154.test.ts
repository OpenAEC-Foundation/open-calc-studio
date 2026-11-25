import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ifcCommand, loadIfcModel, getIfcSession } from '@/services/ifc/ifcLiteWorkspace';
import { useAppStore } from '@/state/appStore';
import type { TakeoffModel } from '@/services/ifc/ifcTakeoff';

const element = (expressId: number, name: string, volume: number) => ({ id: `e${expressId}`, expressId, globalId: `g${expressId}`, name, type: 'IfcWall', quantities: [{ key: 'Qto.NetVolume', label: 'NetVolume', kind: 'volume' as const, value: volume, unit: 'm³' }] });
// Twee modellen met dezelfde express-ID's: precies het geval waarin de verkeerde gegevens niet opvallen.
const modelA: TakeoffModel = { id: 'model-a', fileName: 'A.ifc', elements: [element(1, 'Muur A', 2)] };
const modelB: TakeoffModel = { id: 'model-b', fileName: 'B.ifc', elements: [element(1, 'Muur B', 7)] };
const next = vi.hoisted(() => ({ model: null as unknown as TakeoffModel }));
vi.mock('@/services/ifc/ifcTakeoff', async original => ({ ...await original<typeof import('@/services/ifc/ifcTakeoff')>(), parseTakeoff: vi.fn(async () => next.model) }));
vi.mock('@ifc-lite/geometry', () => ({ GeometryProcessor: class { async init() {} async *processStreaming() {} dispose() {} } }));

beforeEach(() => {
  useAppStore.setState({ documents: [], activeDocumentId: '', items: [] });
  useAppStore.getState().addDocument({ id: 'ifc-kb', items: [] });
});

describe('knownbug 152: modelId wordt gerespecteerd terwijl een ander model open is', () => {
  it('listElements en takeoff gebruiken het gevraagde model A, niet het open model B', async () => {
    next.model = modelA; await loadIfcModel(new ArrayBuffer(0), 'A.ifc');
    next.model = modelB; await loadIfcModel(new ArrayBuffer(0), 'B.ifc');
    expect(getIfcSession('ifc-kb')?.model.id).toBe('model-b');
    const listed = await ifcCommand('listElements', { modelId: 'model-a' }) as { name: string }[];
    expect(listed.map((e) => e.name)).toEqual(['Muur A']);
    const q = await ifcCommand('takeoff', { modelId: 'model-a', elementIds: [1], quantityKey: 'Qto.NetVolume' }) as { value: number };
    expect(q.value).toBe(2);
    // Zonder modelId blijft het open model gelden.
    const open = await ifcCommand('listElements', {}) as { name: string }[];
    expect(open.map((e) => e.name)).toEqual(['Muur B']);
  });

  it('een onbekend modelId geeft een fout in plaats van het open model', async () => {
    next.model = modelB; await loadIfcModel(new ArrayBuffer(0), 'B.ifc');
    await expect(ifcCommand('listElements', { modelId: 'bestaat-niet' })).rejects.toThrow();
  });
});

describe('knownbug 154: IFC-sessie wordt vrijgegeven als het document sluit', () => {
  it('na removeDocument is de sessie (met meshdata) weg', async () => {
    next.model = modelA; await loadIfcModel(new ArrayBuffer(0), 'A.ifc');
    expect(getIfcSession('ifc-kb')).toBeDefined();
    useAppStore.getState().addDocument({ id: 'ander', items: [] });
    useAppStore.getState().removeDocument('ifc-kb');
    expect(getIfcSession('ifc-kb')).toBeUndefined();
  });
});

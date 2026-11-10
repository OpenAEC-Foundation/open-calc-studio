import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';

// knownbugs 7, 8 en 10: arbeid op een regel met tariefgroep is norm ÷ capaciteit × tarief.
const initial = useAppStore.getState();
let lineId: string;
const line = () => useAppStore.getState().items.find(i => i.id === lineId)!;
const s = () => useAppStore.getState();
const undo = () => { const r = s().undo(); expect(r).not.toBeNull(); s().setItems(r!); };
const redo = () => { const r = s().redo(); expect(r).not.toBeNull(); s().setItems(r!); };

beforeEach(() => {
  useAppStore.setState(initial, true);
  s().addDocument({ id: 'rates-doc', items: [] });
  s().updateTarieven({ A: 50, B: 43, C: 82 });
  lineId = s().addRegel(s().addItem(s().addChapter(null)));
  s().updateItem(lineId, 'quantity', 10);
  s().updateItem(lineId, 'tariefGroep', 'A');
  s().updateItem(lineId, 'normQuantity', 2);
  useAppStore.setState({ undoStack: [], redoStack: [] });
});

describe('labour from a rate group', () => {
  it('starts as norm × rate', () => {
    expect(line().laborPrice).toBe(100);
    expect(line().total).toBe(1000);
  });

  it('clearing the norm also clears the labour it produced, like typing 0 (7)', () => {
    s().updateItem(lineId, 'normQuantity', null);
    expect(line().laborPrice).toBeNull();
    expect(line().total).toBe(0);
  });

  it('a directly entered labour price on a line without norm stays (7)', () => {
    const direct = s().addRegel(s().addItem(s().addChapter(null)));
    s().updateItem(direct, 'quantity', 3);
    s().updateItem(direct, 'tariefGroep', 'A');
    s().updateItem(direct, 'laborPrice', 40);
    s().updateItem(direct, 'description', 'Stelpost loon');
    const item = s().items.find(i => i.id === direct)!;
    expect(item.laborPrice).toBe(40);
    expect(item.total).toBe(120);
  });

  it('a price index on labour survives the next unrelated edit (8)', () => {
    s().pushHistory(s().items, 'prices');
    s().scaleAllPrices(1.1);
    expect(line().laborPrice).toBeCloseTo(110);
    expect(s().schedule.tarieven!.A).toBeCloseTo(55);
    s().updateItem(lineId, 'description', 'Metselwerk');
    expect(line().laborPrice).toBeCloseTo(110);
  });

  it('undo of a price index restores both the rates and the labour (8)', () => {
    s().pushHistory(s().items, 'prices');
    s().scaleAllPrices(1.1);
    undo();
    expect(s().schedule.tarieven!.A).toBe(50);
    expect(line().laborPrice).toBe(100);
    redo();
    expect(s().schedule.tarieven!.A).toBeCloseTo(55);
    expect(line().laborPrice).toBeCloseTo(110);
  });

  it('undo of an earlier edit after a rate change keeps labour on the current rate (10)', () => {
    s().pushHistory(s().items, 'quantity');
    s().updateItem(lineId, 'quantity', 20);
    s().updateTarieven({ ...s().schedule.tarieven!, A: 60 });
    undo(); // de hoeveelheid terug, gemaakt toen het tarief 50 was
    expect(line().quantity).toBe(10);
    // Tarief en arbeid horen bij elkaar: geen 100 bij tarief 60 meer.
    expect(line().laborPrice).toBe(s().schedule.tarieven!.A * 2);
    const before = line().total;
    s().updateItem(lineId, 'description', 'iets anders');
    expect(line().total).toBe(before); // geen stille sprong bij de volgende bewerking
  });

  it('a rate change is its own undo step (10)', () => {
    s().pushHistory(s().items, 'rate A'); // zoals het onderpaneel doet
    s().updateTarieven({ ...s().schedule.tarieven!, A: 60 });
    expect(line().laborPrice).toBe(120);
    undo();
    expect(s().schedule.tarieven!.A).toBe(50);
    expect(line().laborPrice).toBe(100);
  });
});

// Een nieuwe begroting heeft geen eigen tarieven: alles rekent dan met de standaard.
describe('labour without rates of its own (new estimate)', () => {
  beforeEach(() => {
    useAppStore.setState(initial, true);
    s().addDocument({ id: 'default-rates-doc', items: [] });
    s().setSchedule({ tarieven: undefined });
    lineId = s().addRegel(s().addItem(s().addChapter(null)));
    s().updateItem(lineId, 'quantity', 10);
    s().updateItem(lineId, 'tariefGroep', 'A');
    s().updateItem(lineId, 'normQuantity', 2);
    useAppStore.setState({ undoStack: [], redoStack: [] });
    expect(s().schedule.tarieven).toBeUndefined();
    expect(line().laborPrice).toBe(128); // 2 × standaardtarief 64
  });

  it('a price index survives the next edit (8)', () => {
    s().pushHistory(s().items, 'prices');
    s().scaleAllPrices(1.1);
    expect(s().schedule.tarieven!.A).toBe(70.4);
    s().updateItem(lineId, 'description', 'Metselwerk');
    expect(line().laborPrice).toBeCloseTo(140.8);
    undo();
    expect(line().laborPrice).toBe(128);
  });

  it('undo of the first rate change restores the labour (10)', () => {
    s().pushHistory(s().items, 'rate A');
    s().updateTarieven({ A: 70, B: 43, C: 82 });
    expect(line().laborPrice).toBe(140);
    undo();
    expect(s().schedule.tarieven!.A).toBe(64);
    expect(line().laborPrice).toBe(128);
  });
});

describe('labour rates through MCP', () => {
  it('undo of a rate change restores rates and labour together', async () => {
    await executeDesktopCommand('updateTarieven', { tarieven: { A: 60, B: 43, C: 82 } });
    expect(line().laborPrice).toBe(120);
    await executeDesktopCommand('undo');
    expect(s().schedule.tarieven!.A).toBe(50);
    expect(line().laborPrice).toBe(100);
  });

  it('undo of a price index restores the rates from before the index', async () => {
    await executeDesktopCommand('scaleAllPrices', { factor: 1.1 });
    expect(s().schedule.tarieven!.A).toBe(55);
    await executeDesktopCommand('undo');
    expect(s().schedule.tarieven!.A).toBe(50);
    expect(line().laborPrice).toBe(100);
  });
});

describe('empty rate table', () => {
  it('counts as no rates, so labour is not wiped on load', () => {
    s().setSchedule({ tarieven: {} });
    s().setItems(s().items);
    expect(line().laborPrice).toBe(128); // 2 × standaardtarief 64, niet 0
  });
});

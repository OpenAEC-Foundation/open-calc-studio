import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountIsolated, type IsolatedStudio } from '../lib/isolated';
const instances: IsolatedStudio[] = [];
afterEach(() => { instances.splice(0).forEach(i => i.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); });
function setup() {
  const host = document.createElement('div'); document.body.append(host);
  const instance = mountIsolated(host, { src: 'https://calc.example/frame/index.html' });
  instances.push(instance);
  const send = vi.spyOn(instance.iframe.contentWindow!, 'postMessage');
  instance.iframe.dispatchEvent(new Event('load'));
  const init = send.mock.calls[0][0];
  const deliver = (data: any, origin = 'https://calc.example', source: any = instance.iframe.contentWindow) => {
    window.dispatchEvent(new MessageEvent('message', { origin, source, data: { protocol: init.protocol, channel: init.channel, ...data } }));
  };
  return { instance, send, deliver };
}
describe('isolated embedding protocol', () => {
  it('keeps frames and response channels independent', async () => {
    const a = setup(), b = setup();
    a.deliver({ type: 'ready' }); b.deliver({ type: 'ready' });
    await Promise.all([a.instance.ready, b.instance.ready]);
    const result = a.instance.getProjectJson(); await Promise.resolve();
    const request = a.send.mock.calls[a.send.mock.calls.length - 1][0];
    a.deliver({ type: 'reply', id: request.id, payload: 'wrong' }, 'https://attacker.example');
    a.deliver({ type: 'reply', id: request.id, payload: 'wrong' }, 'https://calc.example', b.instance.iframe.contentWindow);
    a.deliver({ type: 'reply', id: request.id, payload: 'budget A' });
    expect(await result).toBe('budget A');
    expect(a.instance.iframe).not.toBe(b.instance.iframe);
    a.instance.unmount();
    expect(b.instance.iframe.isConnected).toBe(true);
  });
  it('rejects pending calls and removes its frame when unmounted', async () => {
    const { instance, deliver } = setup(); deliver({ type: 'ready' }); await instance.ready;
    const result = instance.getProjectJson(); await Promise.resolve();
    instance.unmount();
    await expect(result).rejects.toThrow('unmounted');
    await expect(instance.getProjectJson()).rejects.toThrow('unmounted');
    expect(instance.iframe.isConnected).toBe(false);
  });
  it('times out when the hosted frame does not respond', async () => {
    vi.useFakeTimers(); const { instance } = setup();
    const check = expect(instance.ready).rejects.toThrow('initialize');
    await vi.advanceTimersByTimeAsync(30001); await check;
  });
});

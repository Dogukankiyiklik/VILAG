import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIpcClient } from './renderer';

describe('createIpcClient', () => {
  const invoke = vi.fn();
  const on = vi.fn();
  const send = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    on.mockReset();
    send.mockReset();

    (globalThis as any).window = {
      electron: {
        ipcRenderer: {
          invoke,
          on,
          send,
        },
      },
    };
  });

  it('forwards invoke calls with channel and payload in the same format', async () => {
    invoke.mockResolvedValue({ ok: true });
    const client = createIpcClient();
    const payload = { task: 'run', meta: { id: 7 } };

    const result = await client.invoke('agent:run', payload);

    expect(invoke).toHaveBeenCalledWith('agent:run', payload);
    expect(result).toEqual({ ok: true });
  });

  it('forwards send calls with channel and payload in the same format', () => {
    const client = createIpcClient();
    const payload = { loop: 3, status: 'running' };

    client.send('agent:step', payload);

    expect(send).toHaveBeenCalledWith('agent:step', payload);
  });

  it('passes only renderer callback args (without electron event)', () => {
    const client = createIpcClient();
    const callback = vi.fn();

    client.on('agent:update', callback);
    const registered = on.mock.calls[0][1];

    registered({ sender: 'event' }, { progress: 50 }, 'ok');

    expect(callback).toHaveBeenCalledWith({ progress: 50 }, 'ok');
  });
});

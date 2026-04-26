import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcMainMock } = vi.hoisted(() => ({
  ipcMainMock: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
}));

import { registerIpcHandlers, removeIpcHandlers } from './main';

describe('IPC main helpers', () => {
  beforeEach(() => {
    ipcMainMock.handle.mockReset();
    ipcMainMock.removeHandler.mockReset();
  });

  it('registers channels and passes args with unchanged message format', async () => {
    const runHandler = vi.fn(async (payload: { id: string }, retry: number) => ({
      ok: true,
      id: payload.id,
      retry,
    }));

    registerIpcHandlers({
      'agent:run': runHandler,
    });

    expect(ipcMainMock.handle).toHaveBeenCalledTimes(1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith('agent:run', expect.any(Function));

    const wrappedHandler = ipcMainMock.handle.mock.calls[0][1];
    const result = await wrappedHandler({}, { id: 'abc' }, 2);

    expect(runHandler).toHaveBeenCalledWith({ id: 'abc' }, 2);
    expect(result).toEqual({ ok: true, id: 'abc', retry: 2 });
  });

  it('removes each channel handler', () => {
    removeIpcHandlers(['agent:run', 'agent:step']);

    expect(ipcMainMock.removeHandler).toHaveBeenNthCalledWith(1, 'agent:run');
    expect(ipcMainMock.removeHandler).toHaveBeenNthCalledWith(2, 'agent:step');
  });
});

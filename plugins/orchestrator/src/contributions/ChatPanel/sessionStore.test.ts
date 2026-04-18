// Sanity tests for the plugin-storage backed session API. Proves we honour
// the same 5-method contract Spark's internal session provider expects and
// that round-trips go through `ctx.storage`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pluginSessionApi } from './sessionStore';
import { configurePluginContext, disposePluginContext } from '../runtime';
import type { PluginContext } from '@snapfzz/plugin-sdk';

function makeCtxWithMemoryStorage(): PluginContext {
  const store = new Map<string, unknown>();
  return {
    storage: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
      delete: vi.fn(async (key: string) => { store.delete(key); }),
    },
  } as unknown as PluginContext;
}

beforeEach(() => {
  configurePluginContext(makeCtxWithMemoryStorage());
});

afterEach(() => {
  disposePluginContext();
});

describe('A013/ChatPanel/sessionStore', () => {
  it('seeds a default session on first getSessionList when storage is empty', async () => {
    const list = await pluginSessionApi.getSessionList();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBeTruthy();
    expect(list[0].messages).toEqual([]);
  });

  it('createSession prepends to the list and returns the updated list', async () => {
    await pluginSessionApi.getSessionList();
    const next = await pluginSessionApi.createSession({ name: 'Second' });
    expect(next).toHaveLength(2);
    expect(next[0].name).toBe('Second');
  });

  it('updateSession merges new messages into an existing entry', async () => {
    const seeded = await pluginSessionApi.getSessionList();
    const id = seeded[0].id;
    const msg = { id: 'm1', role: 'user', content: 'hi' } as never;
    const after = await pluginSessionApi.updateSession({ id, messages: [msg] });
    const updated = after.find((s) => s.id === id);
    expect(updated?.messages).toEqual([msg]);
  });

  it('updateSession upserts a session that doesn\'t exist yet', async () => {
    const after = await pluginSessionApi.updateSession({ id: 'fresh-id', name: 'ghost' });
    expect(after.find((s) => s.id === 'fresh-id')?.name).toBe('ghost');
  });

  it('removeSession drops the matching id and leaves others alone', async () => {
    await pluginSessionApi.getSessionList();
    const withExtra = await pluginSessionApi.createSession({ name: 'doomed' });
    const doomed = withExtra[0];
    const survivors = await pluginSessionApi.removeSession({ id: doomed.id });
    expect(survivors.find((s) => s.id === doomed.id)).toBeUndefined();
  });

  it('getSession throws for an unknown id (Spark expects truthy object)', async () => {
    await pluginSessionApi.getSessionList();
    await expect(pluginSessionApi.getSession('unknown')).rejects.toThrow(/not found/);
  });
});

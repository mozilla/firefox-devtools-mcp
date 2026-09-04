import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXISTING_FIREFOX_IDLE_TIMEOUT_MS,
  ExistingFirefoxIdleController,
} from '@/firefox/idle-connection.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ExistingFirefoxIdleController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disconnects an existing Firefox connection after 30 minutes idle', async () => {
    let connected = true;
    const disconnect = vi.fn(async () => {
      connected = false;
    });
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => connected,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    await controller.runWithActivity(async () => undefined);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS - 1);
    expect(disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(connected).toBe(false);
  });

  it('does not schedule idle disconnects for MCP-launched Firefox', async () => {
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: false,
      hasActiveConnection: () => true,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    await controller.runWithActivity(async () => undefined);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS * 2);

    expect(disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets the timeout when another tool call starts', async () => {
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => true,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    await controller.runWithActivity(async () => undefined);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS / 2);
    await controller.runWithActivity(async () => undefined);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS / 2);
    expect(disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS / 2);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('does not disconnect while a long-running tool call is active', async () => {
    const operation = deferred();
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => true,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    const running = controller.runWithActivity(() => operation.promise);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS * 2);
    expect(disconnect).not.toHaveBeenCalled();

    operation.resolve();
    await running;
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('waits for all concurrent tool calls before starting the timeout', async () => {
    const first = deferred();
    const second = deferred();
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => true,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    const firstRun = controller.runWithActivity(() => first.promise);
    const secondRun = controller.runWithActivity(() => second.promise);
    first.resolve();
    await firstRun;
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS * 2);
    expect(disconnect).not.toHaveBeenCalled();

    second.resolve();
    await secondRun;
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the server alive and reconnects lazily across repeated idle cycles', async () => {
    let connected = false;
    const disconnect = vi.fn(async () => {
      connected = false;
    });
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => connected,
      disconnect,
      onDisconnectError: vi.fn(),
    });
    let connectionCount = 0;
    const useFirefox = () =>
      controller.runWithActivity(async () => {
        if (!connected) {
          connected = true;
          connectionCount++;
        }
      });

    await useFirefox();
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);
    expect(connected).toBe(false);
    expect(disconnect).toHaveBeenCalledOnce();

    await useFirefox();
    expect(connectionCount).toBe(2);
    expect(disconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);
    await useFirefox();
    expect(connectionCount).toBe(3);
  });

  it('does nothing when the timeout fires without an active connection', async () => {
    let connected = true;
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => connected,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    await controller.runWithActivity(async () => undefined);
    connected = false;
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('clears its timer during cleanup', async () => {
    const disconnect = vi.fn(async () => undefined);
    const controller = new ExistingFirefoxIdleController({
      enabled: true,
      hasActiveConnection: () => true,
      disconnect,
      onDisconnectError: vi.fn(),
    });

    await controller.runWithActivity(async () => undefined);
    expect(vi.getTimerCount()).toBe(1);

    await controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(EXISTING_FIREFOX_IDLE_TIMEOUT_MS);
    expect(disconnect).not.toHaveBeenCalled();
  });
});

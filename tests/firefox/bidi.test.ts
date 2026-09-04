/**
 * Unit tests for BidiFacade module
 */

import { describe, it, expect, vi } from 'vitest';
import { BiDiFacade } from '@/firefox/bidi.js';

// Tests for sendCommand WebSocket handling
describe('BidiFacade sendCommand WebSocket readiness', () => {
  it('should wait for WebSocket to open when in CONNECTING state', async () => {
    // Track event listeners and send calls
    const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSend = vi.fn();

    // Mock WebSocket in CONNECTING state (readyState 0)
    const mockWs = {
      readyState: 0, // CONNECTING
      send: mockSend,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
      }),
      off: vi.fn(),
    };

    // Mock driver with BiDi socket
    const driver = {
      getBidi: vi.fn().mockResolvedValue({
        socket: mockWs,
      }),
    };
    const bidi = new BiDiFacade(driver as any);

    // Start the command (don't await yet)
    const commandPromise = bidi.sendCommand('session.new', { capabilities: {} });

    // Give the async code a tick to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    // ASSERT: send() should NOT have been called while still CONNECTING
    expect(mockSend).not.toHaveBeenCalled();

    // ASSERT: should have registered an 'open' event listener
    expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));

    // Now simulate WebSocket becoming OPEN
    mockWs.readyState = 1; // OPEN
    if (eventListeners['open']) {
      eventListeners['open'].forEach((handler) => handler());
    }

    // Give another tick for send to be called
    await new Promise((resolve) => setTimeout(resolve, 10));

    // ASSERT: send() should now have been called
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('"method":"session.new"'));

    // Simulate response to complete the promise
    if (eventListeners['message']) {
      const sentCommand = JSON.parse(mockSend.mock.calls[0][0]);
      eventListeners['message'].forEach((handler) =>
        handler(JSON.stringify({ id: sentCommand.id, result: { success: true } }))
      );
    }

    const result = await commandPromise;
    expect(result).toEqual({ success: true });
  });

  it('should timeout if WebSocket never opens', async () => {
    const driver = {} as any;
    const bidi = new BiDiFacade(driver);

    // Track event listeners
    const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    // Mock WebSocket stuck in CONNECTING state (never opens)
    const mockWs = {
      readyState: 0, // CONNECTING - stays this way
      send: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
      }),
      off: vi.fn(),
    };

    // Access the private method directly to test with a short timeout
    const waitForWebSocketOpen = (bidi as any).waitForWebSocketOpen.bind(bidi);

    // ASSERT: should reject with timeout error (using 50ms timeout for fast test)
    await expect(waitForWebSocketOpen(mockWs, 50)).rejects.toThrow(/timeout.*websocket/i);
  });

  it('should throw error when WebSocket is CLOSING', async () => {
    const driver = {} as any;
    const bidi = new BiDiFacade(driver);

    // Mock WebSocket in CLOSING state (readyState 2)
    const mockWs = {
      readyState: 2, // CLOSING
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (bidi as any).waitForWebSocketOpen.bind(bidi);

    // ASSERT: should throw immediately with descriptive error
    await expect(waitForWebSocketOpen(mockWs)).rejects.toThrow(
      /websocket is not open.*readystate 2/i
    );
  });

  it('should throw error when WebSocket is CLOSED', async () => {
    const driver = {} as any;
    const bidi = new BiDiFacade(driver);

    // Mock WebSocket in CLOSED state (readyState 3)
    const mockWs = {
      readyState: 3, // CLOSED
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (bidi as any).waitForWebSocketOpen.bind(bidi);

    // ASSERT: should throw immediately with descriptive error
    await expect(waitForWebSocketOpen(mockWs)).rejects.toThrow(
      /websocket is not open.*readystate 3/i
    );
  });

  it('should proceed immediately when WebSocket is already OPEN', async () => {
    const driver = {} as any;
    const bidi = new BiDiFacade(driver);

    // Mock WebSocket already in OPEN state (readyState 1)
    const mockWs = {
      readyState: 1, // OPEN
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Access the private method directly
    const waitForWebSocketOpen = (bidi as any).waitForWebSocketOpen.bind(bidi);

    // ASSERT: should resolve immediately without registering any listeners
    await expect(waitForWebSocketOpen(mockWs)).resolves.toBeUndefined();
    expect(mockWs.on).not.toHaveBeenCalled();
  });
});

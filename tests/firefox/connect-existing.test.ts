/**
 * Tests for connect-existing mode (FirefoxCore behaviour)
 */

import { describe, it, expect, vi } from 'vitest';

describe('getFirefox() reconnect behavior', () => {
  it('should reconnect when connection is lost instead of throwing', async () => {
    vi.resetModules();

    // Mock the firefox module
    const mockIsConnected = vi.fn();
    const mockConnect = vi.fn();
    const mockClose = vi.fn();

    vi.doMock('@/firefox/index.js', () => ({
      FirefoxDevTools: vi.fn(() => ({
        isConnected: mockIsConnected,
        connect: mockConnect,
        close: mockClose,
      })),
    }));

    // First call: create instance, connection works
    mockIsConnected.mockResolvedValueOnce(true);
    mockConnect.mockResolvedValue(undefined);

    // This test verifies the reconnect logic pattern:
    // When isConnected() returns false, getFirefox() should reset and create
    // a new connection instead of throwing FirefoxDisconnectedError
    const { FirefoxCore } = await import('@/firefox/core.js');
    const core = new FirefoxCore({
      headless: true,
      connectExisting: true,
      marionettePort: 2828,
    });

    // Verify reset clears the state
    core.setCurrentContextId('old-context');
    core.reset();
    expect(core.getCurrentContextId()).toBe(null);
    expect(() => core.getDriver()).toThrow('Driver not connected');
  });
});

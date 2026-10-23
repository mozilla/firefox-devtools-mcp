import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screencastStartTool, screencastStopTool } from '../../../src/tools/screencast.js';
import type { McpToolResponse } from '../../../src/types/common.js';

const mockGetFirefox = vi.hoisted(() => vi.fn());

type ScreencastHandler = (args: unknown) => Promise<McpToolResponse>;

vi.mock('../../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

describe('Screencast Tool Definitions', () => {
  describe('screencastStartTool', () => {
    it('should have correct name', () => {
      expect(screencastStartTool.name).toBe('screencast_start');
    });

    it('should have description', () => {
      expect(screencastStartTool.description.length).toBeGreaterThan(0);
    });

    it('should define video options', () => {
      const schema = screencastStartTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.frameRate?.type).toBe('integer');
      expect(schema.properties?.width?.type).toBe('integer');
      expect(schema.properties?.height?.type).toBe('integer');
      expect(schema.properties?.mimeType?.type).toBe('string');
    });
  });

  describe('screencastStopTool', () => {
    it('should have correct name', () => {
      expect(screencastStopTool.name).toBe('screencast_stop');
    });

    it('should have description', () => {
      expect(screencastStopTool.description.length).toBeGreaterThan(0);
    });
  });
});

describe('Screencast Tool Handlers', () => {
  const mockSendBiDiCommand = vi.fn();
  const mockGetCurrentContextId = vi.fn();
  let handleScreencastStart: ScreencastHandler;
  let handleScreencastStop: ScreencastHandler;

  beforeEach(async () => {
    // resetAllMocks clears the mockResolvedValueOnce queues; resetModules gives a
    // fresh screencast module so the internal activeRecordings map does not leak
    // between tests.
    vi.resetAllMocks();
    vi.resetModules();
    mockGetCurrentContextId.mockReturnValue('ctx-1');
    mockGetFirefox.mockResolvedValue({
      sendBiDiCommand: mockSendBiDiCommand,
      getFirefoxVersion: () => '154.0',
      getCurrentContextId: mockGetCurrentContextId,
    });
    ({ handleScreencastStart, handleScreencastStop } = await import(
      '../../../src/tools/screencast.js'
    ));
  });

  describe('version check', () => {
    it('should return error when Firefox version is below 154', async () => {
      mockGetFirefox.mockResolvedValue({
        sendBiDiCommand: mockSendBiDiCommand,
        getFirefoxVersion: () => '153.0',
        getCurrentContextId: mockGetCurrentContextId,
      });

      const result = await handleScreencastStart({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('154');
    });

    it('should proceed when Firefox version is unknown', async () => {
      mockGetFirefox.mockResolvedValue({
        sendBiDiCommand: mockSendBiDiCommand,
        getFirefoxVersion: () => null,
        getCurrentContextId: mockGetCurrentContextId,
      });
      mockSendBiDiCommand.mockResolvedValue({ screencast: 'sc-1', path: '/dl/screencast.webm' });

      const result = await handleScreencastStart({});

      expect(result.isError).toBeUndefined();
    });
  });

  describe('handleScreencastStart', () => {
    it('should start a screencast on the current context', async () => {
      mockSendBiDiCommand.mockResolvedValue({
        screencast: 'sc-1',
        path: '/dl/screencast-sc-1.webm',
      });

      const result = await handleScreencastStart({});

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('browsingContext.startScreencast', {
        context: 'ctx-1',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('sc-1');
      expect(result.content[0].text).toContain('/dl/screencast-sc-1.webm');
    });

    it('should use an explicit context when provided', async () => {
      mockSendBiDiCommand.mockResolvedValue({ screencast: 'sc-2', path: '/dl/sc-2.webm' });

      await handleScreencastStart({ context: 'ctx-explicit' });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('browsingContext.startScreencast', {
        context: 'ctx-explicit',
      });
    });

    it('should pass video and mimeType options', async () => {
      mockSendBiDiCommand.mockResolvedValue({ screencast: 'sc-3', path: '/dl/sc-3.mkv' });

      await handleScreencastStart({
        frameRate: 30,
        width: 1280,
        height: 720,
        mimeType: 'video/x-matroska',
      });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('browsingContext.startScreencast', {
        context: 'ctx-1',
        video: { frameRate: 30, width: 1280, height: 720 },
        mimeType: 'video/x-matroska',
      });
    });

    it('should return error when there is no active context', async () => {
      mockGetCurrentContextId.mockReturnValue(null);

      const result = await handleScreencastStart({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active browsing context');
    });

    it('should return error when BiDi command fails', async () => {
      mockSendBiDiCommand.mockRejectedValue(new Error('BiDi error'));

      const result = await handleScreencastStart({});

      expect(result.isError).toBe(true);
    });
  });

  describe('handleScreencastStop', () => {
    it('should stop a screencast by id and return the path', async () => {
      mockSendBiDiCommand.mockResolvedValueOnce({
        screencast: 'sc-stop',
        path: '/dl/sc-stop.webm',
      });
      await handleScreencastStart({});

      mockSendBiDiCommand.mockResolvedValueOnce({ path: '/dl/sc-stop.webm' });
      const result = await handleScreencastStop({ screencast: 'sc-stop' });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('browsingContext.stopScreencast', {
        screencast: 'sc-stop',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('/dl/sc-stop.webm');
    });

    it('should default to the only active recording when no id is given', async () => {
      mockSendBiDiCommand.mockResolvedValueOnce({
        screencast: 'sc-only',
        path: '/dl/sc-only.webm',
      });
      await handleScreencastStart({});

      mockSendBiDiCommand.mockResolvedValueOnce({ path: '/dl/sc-only.webm' });
      const result = await handleScreencastStop({});

      expect(mockSendBiDiCommand).toHaveBeenLastCalledWith('browsingContext.stopScreencast', {
        screencast: 'sc-only',
      });
      expect(result.isError).toBeUndefined();
    });

    it('should return error when no recording is active and no id is given', async () => {
      const result = await handleScreencastStop({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active screencast');
    });

    it('should surface a recording error alongside the path', async () => {
      mockSendBiDiCommand.mockResolvedValueOnce({ screencast: 'sc-err', path: '/dl/sc-err.webm' });
      await handleScreencastStart({});

      mockSendBiDiCommand.mockResolvedValueOnce({ path: '/dl/sc-err.webm', error: 'disk full' });
      const result = await handleScreencastStop({ screencast: 'sc-err' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('disk full');
      expect(result.content[0].text).toContain('/dl/sc-err.webm');
    });

    it('should return error when BiDi command fails', async () => {
      mockSendBiDiCommand.mockRejectedValue(new Error('Screencast with id missing not found'));

      const result = await handleScreencastStop({ screencast: 'missing' });

      expect(result.isError).toBe(true);
    });
  });
});

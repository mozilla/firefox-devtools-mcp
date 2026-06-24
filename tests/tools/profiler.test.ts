import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  profilerIsActiveTool,
  profilerStartTool,
  profilerStopTool,
  handleProfilerIsActive,
  handleProfilerStart,
  handleProfilerStop,
} from '../../src/tools/profiler.js';

const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

describe('Profiler Tool Definitions', () => {
  describe('profilerIsActiveTool', () => {
    it('should have correct name', () => {
      expect(profilerIsActiveTool.name).toBe('profiler_is_active');
    });

    it('should have description', () => {
      expect(profilerIsActiveTool.description.length).toBeGreaterThan(0);
    });
  });

  describe('profilerStartTool', () => {
    it('should have correct name', () => {
      expect(profilerStartTool.name).toBe('profiler_start');
    });

    it('should have description', () => {
      expect(profilerStartTool.description.length).toBeGreaterThan(0);
    });

    it('should define preset as enum', () => {
      const schema = profilerStartTool.inputSchema as {
        properties?: Record<string, { type: string; enum?: string[] }>;
      };
      expect(schema.properties?.preset?.enum).toContain('web-developer');
      expect(schema.properties?.preset?.enum).toContain('firefox-platform');
    });
  });

  describe('profilerStopTool', () => {
    it('should have correct name', () => {
      expect(profilerStopTool.name).toBe('profiler_stop');
    });

    it('should have description', () => {
      expect(profilerStopTool.description.length).toBeGreaterThan(0);
    });

    it('should define discard as boolean', () => {
      const schema = profilerStopTool.inputSchema as {
        properties?: Record<string, { type: string }>;
      };
      expect(schema.properties?.discard?.type).toBe('boolean');
    });
  });
});

describe('Profiler Tool Handlers', () => {
  const mockSendBiDiCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFirefox.mockResolvedValue({
      sendBiDiCommand: mockSendBiDiCommand,
      getFirefoxVersion: () => '154.0',
    });
  });

  describe('version check', () => {
    it('should return error when Firefox version is below 154', async () => {
      mockGetFirefox.mockResolvedValue({
        sendBiDiCommand: mockSendBiDiCommand,
        getFirefoxVersion: () => '153.0',
      });

      const result = await handleProfilerIsActive({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('154');
    });

    it('should proceed when Firefox version is 154 or later', async () => {
      mockSendBiDiCommand.mockResolvedValue({ active: false });

      const result = await handleProfilerIsActive({});

      expect(result.isError).toBeUndefined();
    });

    it('should proceed when Firefox version is unknown', async () => {
      mockGetFirefox.mockResolvedValue({
        sendBiDiCommand: mockSendBiDiCommand,
        getFirefoxVersion: () => null,
      });
      mockSendBiDiCommand.mockResolvedValue({ active: false });

      const result = await handleProfilerIsActive({});

      expect(result.isError).toBeUndefined();
    });
  });

  describe('handleProfilerIsActive', () => {
    it('should return active status when profiler is running', async () => {
      mockSendBiDiCommand.mockResolvedValue({ active: true });

      const result = await handleProfilerIsActive({});

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.isActive', {});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('active');
    });

    it('should return inactive status when profiler is not running', async () => {
      mockSendBiDiCommand.mockResolvedValue({ active: false });

      const result = await handleProfilerIsActive({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('inactive');
    });

    it('should return error when BiDi command fails', async () => {
      mockSendBiDiCommand.mockRejectedValue(new Error('BiDi error'));

      const result = await handleProfilerIsActive({});

      expect(result.isError).toBe(true);
    });
  });

  describe('handleProfilerStart', () => {
    it('should start profiler with a preset', async () => {
      mockSendBiDiCommand.mockResolvedValue({});

      const result = await handleProfilerStart({ preset: 'web-developer' });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.start', {
        preset: 'web-developer',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('started');
    });

    it('should start profiler with explicit config', async () => {
      mockSendBiDiCommand.mockResolvedValue({});

      const result = await handleProfilerStart({
        entries: 10000000,
        interval: 1,
        features: ['js', 'cpu'],
        threads: ['GeckoMain', 'Compositor'],
      });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.start', {
        entries: 10000000,
        interval: 1,
        features: ['js', 'cpu'],
        threads: ['GeckoMain', 'Compositor'],
      });
      expect(result.isError).toBeUndefined();
    });

    it('should include activeContext when provided', async () => {
      mockSendBiDiCommand.mockResolvedValue({});

      await handleProfilerStart({ preset: 'web-developer', activeContext: 'ctx-1' });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.start', {
        preset: 'web-developer',
        activeContext: 'ctx-1',
      });
    });

    it('should return error when neither preset nor full explicit config is given', async () => {
      const result = await handleProfilerStart({ entries: 10000000 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'entries, interval, features, and threads are all required'
      );
    });

    it('should return error when BiDi command fails', async () => {
      mockSendBiDiCommand.mockRejectedValue(new Error('BiDi error: profiler already running'));

      const result = await handleProfilerStart({ preset: 'web-developer' });

      expect(result.isError).toBe(true);
    });
  });

  describe('handleProfilerStop', () => {
    it('should stop profiler and return path when profile is saved', async () => {
      mockSendBiDiCommand.mockResolvedValue({ path: '/home/user/Downloads/profile-abc.json' });

      const result = await handleProfilerStop({});

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.stop', {});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('/home/user/Downloads/profile-abc.json');
    });

    it('should report no profile saved when path is null', async () => {
      mockSendBiDiCommand.mockResolvedValue({ path: null });

      const result = await handleProfilerStop({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('No profile was saved');
    });

    it('should pass discard option to BiDi command', async () => {
      mockSendBiDiCommand.mockResolvedValue({ path: null });

      await handleProfilerStop({ discard: true });

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.stop', { discard: true });
    });

    it('should not include discard when not provided', async () => {
      mockSendBiDiCommand.mockResolvedValue({ path: null });

      await handleProfilerStop({});

      expect(mockSendBiDiCommand).toHaveBeenCalledWith('moz:profiler.stop', {});
    });

    it('should return error when BiDi command fails', async () => {
      mockSendBiDiCommand.mockRejectedValue(new Error('BiDi error'));

      const result = await handleProfilerStop({});

      expect(result.isError).toBe(true);
    });
  });
});

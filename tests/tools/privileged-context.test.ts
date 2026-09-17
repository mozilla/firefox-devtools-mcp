import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluatePrivilegedScriptTool,
  handleEvaluatePrivilegedScript,
  handleSelectPrivilegedContext,
} from '../../src/tools/privileged-context.js';

// Mock the index module (used by handler tests)
const mockGetFirefox = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

// Chrome-scoped tree as returned by browsingContext.getTree: the chrome window
// is top-level, content tabs are its children.
const CHROME_TREE = {
  contexts: [
    {
      context: 'chrome-1',
      url: 'chrome://browser/content/browser.xhtml',
      children: [{ context: 'tab-1', url: 'https://example.com/', children: [] }],
    },
  ],
};

function mockFirefoxForEval(callFunctionResult: unknown) {
  return {
    sendBiDiCommand: vi.fn((method: string) =>
      method === 'browsingContext.getTree'
        ? Promise.resolve(CHROME_TREE)
        : Promise.resolve(callFunctionResult)
    ),
  };
}

describe('Privileged Context Tool Definitions', () => {
  describe('evaluatePrivilegedScriptTool', () => {
    it('should have correct name', () => {
      expect(evaluatePrivilegedScriptTool.name).toBe('evaluate_privileged_script');
    });

    it('should require function parameter', () => {
      expect(evaluatePrivilegedScriptTool.inputSchema.required).toContain('function');
    });

    it('should require context parameter', () => {
      const { properties, required } = evaluatePrivilegedScriptTool.inputSchema;
      expect(properties?.context).toBeDefined();
      expect(properties?.context.type).toBe('string');
      expect(required).toContain('context');
    });

    it('should have optional saveTo parameter of type boolean|string', () => {
      const { properties, required } = evaluatePrivilegedScriptTool.inputSchema;
      expect(properties?.saveTo).toBeDefined();
      expect(properties?.saveTo.type).toEqual(['boolean', 'string']);
      expect(required).not.toContain('saveTo');
    });

    it('should have optional numeric preview parameter', () => {
      const { properties, required } = evaluatePrivilegedScriptTool.inputSchema;
      expect(properties?.preview).toBeDefined();
      expect(properties?.preview.type).toBe('number');
      expect(required).not.toContain('preview');
    });
  });
});

describe('Privileged Context Tool Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleEvaluatePrivilegedScript', () => {
    it('should return error when function parameter is missing', async () => {
      const result = await handleEvaluatePrivilegedScript({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('function parameter is required');
    });

    it('should reject plain expressions (not function strings)', async () => {
      const result = await handleEvaluatePrivilegedScript({ function: 'document.title' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid function format');
    });

    it('should execute valid function in the given privileged context', async () => {
      const mockFirefox = mockFirefoxForEval({
        type: 'success',
        result: { type: 'string', value: 'test-result' },
      });

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({
        function: '() => Services.prefs.getBoolPref("foo")',
        context: 'chrome-1',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('chrome context');
      expect(result.content[0].text).toContain('test-result');
      expect(mockFirefox.sendBiDiCommand).toHaveBeenCalledWith(
        'script.callFunction',
        expect.objectContaining({ target: { context: 'chrome-1' } })
      );
    });

    it('should surface BiDi exception details', async () => {
      const mockFirefox = mockFirefoxForEval({
        type: 'exception',
        exceptionDetails: {
          text: 'ReferenceError: Services is not defined',
          exception: { type: 'object', value: [] },
        },
      });

      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({
        function: '() => Services.prefs.getBoolPref("foo")',
        context: 'chrome-1',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Services is not defined');
    });

    it('should return error when context parameter is missing', async () => {
      const result = await handleEvaluatePrivilegedScript({ function: '() => 1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('context parameter is required');
    });

    it('should reject a content context id without evaluating', async () => {
      const mockFirefox = mockFirefoxForEval({});
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({
        function: '() => 1',
        context: 'tab-1',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a privileged context');
      expect(mockFirefox.sendBiDiCommand).not.toHaveBeenCalledWith(
        'script.callFunction',
        expect.anything()
      );
    });

    it('should reject an unknown context id', async () => {
      const mockFirefox = mockFirefoxForEval({});
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({
        function: '() => 1',
        context: 'no-such-context',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a privileged context');
    });

    it('should explain when system access is not enabled', async () => {
      const mockFirefox = {
        sendBiDiCommand: vi
          .fn()
          .mockRejectedValue(new Error('UnsupportedOperationError: not available')),
      };
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleEvaluatePrivilegedScript({
        function: '() => 1',
        context: 'chrome-1',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('--allow-system-access');
    });
  });

  describe('handleSelectPrivilegedContext', () => {
    it('should switch to a privileged context', async () => {
      const switchWindow = vi.fn().mockResolvedValue(undefined);
      const mockFirefox = {
        sendBiDiCommand: vi.fn().mockResolvedValue(CHROME_TREE),
        setCurrentContextId: vi.fn(),
        getDriver: () => ({
          switchTo: () => ({ window: switchWindow }),
          setContext: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSelectPrivilegedContext({ contextId: 'chrome-1' });

      expect(result.isError).toBeUndefined();
      expect(switchWindow).toHaveBeenCalledWith('chrome-1');
      expect(mockFirefox.setCurrentContextId).toHaveBeenCalledWith('chrome-1');
    });

    it('should reject a content context id without switching', async () => {
      const switchWindow = vi.fn().mockResolvedValue(undefined);
      const mockFirefox = {
        sendBiDiCommand: vi.fn().mockResolvedValue(CHROME_TREE),
        setCurrentContextId: vi.fn(),
        getDriver: () => ({
          switchTo: () => ({ window: switchWindow }),
          setContext: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockGetFirefox.mockResolvedValue(mockFirefox);

      const result = await handleSelectPrivilegedContext({ contextId: 'tab-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a privileged context');
      expect(switchWindow).not.toHaveBeenCalled();
      expect(mockFirefox.setCurrentContextId).not.toHaveBeenCalled();
    });
  });
});

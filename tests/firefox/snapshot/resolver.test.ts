/**
 * Unit tests for UidResolver
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowsingContext, Script } from 'webdriver-bidi-protocol';
import { UidResolver } from '@/firefox/snapshot/resolver.js';
import { nativeToLocalValue } from '@/utils/local-value';

const CONTEXT = 'context-1' as BrowsingContext.BrowsingContext;

// Mock WebDriver
const createMockBiDi = () => ({
  evaluate: vi.fn(),
  callFunction: vi.fn(),
  callFunctionRaw: vi.fn(),
});

describe('UidResolver', () => {
  let mockBiDi: any;
  let resolver: UidResolver;

  beforeEach(() => {
    mockBiDi = createMockBiDi();
    resolver = new UidResolver(mockBiDi);
  });

  describe('resolveUidToElement', () => {
    it('should return the element looked up in the page', async () => {
      const sharedRef: Script.SharedReference = { type: 'node', sharedId: 'shared-1' };
      mockBiDi.callFunctionRaw.mockResolvedValue(sharedRef);

      const element = await resolver.resolveUidToElement(CONTEXT, 'e0');

      expect(element).toEqual({ sharedId: 'shared-1' });
      expect(mockBiDi.callFunctionRaw).toHaveBeenCalledWith(CONTEXT, expect.any(String), [
        nativeToLocalValue('e0'),
      ]);
    });

    it('should throw when the page has no element for the UID', async () => {
      mockBiDi.callFunctionRaw.mockResolvedValue(null);

      await expect(resolver.resolveUidToElement(CONTEXT, 'e0')).rejects.toThrow(/UID not found/);
    });
  });

  describe('resolveUidToSelector', () => {
    it('should return the selector generated in the page', async () => {
      mockBiDi.callFunction.mockResolvedValue('body > button#submit');

      await expect(resolver.resolveUidToSelector(CONTEXT, 'e0')).resolves.toBe(
        'body > button#submit'
      );
    });

    it('should throw when the page has no element for the UID', async () => {
      mockBiDi.callFunction.mockResolvedValue(null);

      await expect(resolver.resolveUidToSelector(CONTEXT, 'e0')).rejects.toThrow(/UID not found/);
    });
  });

  describe('clear', () => {
    it('should clear the UID registry in the page', async () => {
      mockBiDi.evaluate.mockResolvedValue(undefined);

      await resolver.clear(CONTEXT);

      expect(mockBiDi.evaluate).toHaveBeenCalledOnce();
      expect(mockBiDi.evaluate.mock.calls[0][0]).toContain('__clearUidRegistry');
    });

    it('should not throw when the page cannot be reached', async () => {
      mockBiDi.evaluate.mockRejectedValue(new Error('no such window'));

      await expect(resolver.clear(CONTEXT)).resolves.toBeUndefined();
    });
  });
});

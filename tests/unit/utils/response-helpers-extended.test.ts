/**
 * Extended tests for response helpers
 */

import { describe, it, expect } from 'vitest';
import {
  successResponse,
  errorResponse,
  jsonResponse,
  truncateText,
  previewExcerpt,
  truncationFooter,
  TOKEN_LIMITS,
} from '../../../src/utils/response-helpers.js';

describe('Response Helpers - Extended', () => {
  describe('successResponse', () => {
    it('should create response with empty message', () => {
      const response = successResponse('');
      expect(response).toHaveProperty('content');
      expect(response.content[0].text).toBe('');
    });

    it('should create response with multiline message', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const response = successResponse(message);
      expect(response.content[0].text).toBe(message);
    });

    it('should create response with special characters', () => {
      const message = 'Special: !@#$%^&*()';
      const response = successResponse(message);
      expect(response.content[0].text).toBe(message);
    });

    it('should not have isError property', () => {
      const response = successResponse('Test');
      expect(response).not.toHaveProperty('isError');
    });
  });

  describe('errorResponse', () => {
    it('should create error response with empty message', () => {
      const response = errorResponse('');
      expect(response.content[0].text).toBe('Error: ');
      expect(response.isError).toBe(true);
    });

    it('should create error response with multiline message', () => {
      const message = 'Error line 1\nError line 2';
      const response = errorResponse(message);
      expect(response.content[0].text).toContain(message);
      expect(response.isError).toBe(true);
    });

    it('should always have isError set to true', () => {
      const response = errorResponse('Any error');
      expect(response.isError).toBe(true);
    });

    it('should prefix message with "Error: "', () => {
      const response = errorResponse('Something failed');
      expect(response.content[0].text).toMatch(/^Error: /);
    });
  });

  describe('jsonResponse', () => {
    it('should serialize null', () => {
      const response = jsonResponse(null);
      expect(response.content[0].text).toBe('null');
    });

    it('should handle undefined', () => {
      const response = jsonResponse(undefined);
      // JSON.stringify(undefined) returns undefined
      expect(response.content[0].text).toBeUndefined();
    });

    it('should serialize number', () => {
      const response = jsonResponse(42);
      expect(response.content[0].text).toBe('42');
    });

    it('should serialize boolean true', () => {
      const response = jsonResponse(true);
      expect(response.content[0].text).toBe('true');
    });

    it('should serialize boolean false', () => {
      const response = jsonResponse(false);
      expect(response.content[0].text).toBe('false');
    });

    it('should serialize empty array', () => {
      const response = jsonResponse([]);
      expect(response.content[0].text).toBe('[]');
    });

    it('should serialize array with values', () => {
      const data = [1, 2, 3];
      const response = jsonResponse(data);
      expect(response.content[0].text).toContain('1');
      expect(response.content[0].text).toContain('2');
      expect(response.content[0].text).toContain('3');
    });

    it('should serialize empty object', () => {
      const response = jsonResponse({});
      expect(response.content[0].text).toBe('{}');
    });

    it('should serialize nested object', () => {
      const data = {
        user: {
          name: 'John',
          age: 30,
          active: true,
        },
      };
      const response = jsonResponse(data);
      const text = response.content[0].text;
      expect(text).toContain('"user"');
      expect(text).toContain('"name"');
      expect(text).toContain('"John"');
      expect(text).toContain('"age"');
      expect(text).toContain('30');
    });

    it('should serialize with proper indentation', () => {
      const data = { a: 1, b: 2 };
      const response = jsonResponse(data);
      // JSON.stringify with null, 2 creates 2-space indentation
      expect(response.content[0].text).toContain('  ');
    });

    it('should handle special characters in strings', () => {
      const data = { message: 'Line 1\nLine 2\tTab' };
      const response = jsonResponse(data);
      const text = response.content[0].text;
      expect(text).toContain('\\n');
      expect(text).toContain('\\t');
    });

    it('should serialize complex nested structure', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        metadata: {
          count: 2,
          page: 1,
        },
      };
      const response = jsonResponse(data);
      const text = response.content[0].text;
      expect(text).toContain('"users"');
      expect(text).toContain('"Alice"');
      expect(text).toContain('"Bob"');
      expect(text).toContain('"metadata"');
    });

    it('should not have isError property', () => {
      const response = jsonResponse({ test: 'data' });
      expect(response).not.toHaveProperty('isError');
    });
  });

  describe('Content Structure', () => {
    it('successResponse should have array content', () => {
      const response = successResponse('Test');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
    });

    it('errorResponse should have array content', () => {
      const response = errorResponse('Test');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
    });

    it('jsonResponse should have array content', () => {
      const response = jsonResponse({ test: 'data' });
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
    });

    it('all responses should have type text', () => {
      const success = successResponse('Test');
      const error = errorResponse('Test');
      const json = jsonResponse({ test: 'data' });

      expect(success.content[0].type).toBe('text');
      expect(error.content[0].type).toBe('text');
      expect(json.content[0].type).toBe('text');
    });
  });

  describe('truncateText', () => {
    it('should return text unchanged when within the budget', () => {
      expect(truncateText('short', 100)).toBe('short');
    });

    it('should not blow up when the budget is smaller than the suffix', () => {
      const long = 'x'.repeat(1000);
      const result = truncateText(long, 5, '...');
      // Would return nearly the whole string if the slice length went negative.
      expect(result.length).toBeLessThan(20);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('previewExcerpt', () => {
    it('should return an empty string when preview is omitted or non-positive', () => {
      expect(previewExcerpt('data', undefined)).toBe('');
      expect(previewExcerpt('data', 0)).toBe('');
      expect(previewExcerpt('data', -5)).toBe('');
    });

    it('should return the full text when it fits within the requested budget', () => {
      expect(previewExcerpt('hello', 100)).toBe('hello');
    });

    it('should truncate with an ellipsis and stay near the requested budget', () => {
      const long = 'y'.repeat(1000);
      const excerpt = previewExcerpt(long, 100);
      expect(excerpt.endsWith('...')).toBe(true);
      expect(excerpt.length).toBeLessThanOrEqual(100);
      expect(excerpt.length).toBeGreaterThan(50);
    });

    it('should cap the budget at MAX_RESPONSE_CHARS', () => {
      const huge = 'z'.repeat(TOKEN_LIMITS.MAX_RESPONSE_CHARS * 2);
      const excerpt = previewExcerpt(huge, TOKEN_LIMITS.MAX_RESPONSE_CHARS * 2);
      expect(excerpt.length).toBeLessThanOrEqual(TOKEN_LIMITS.MAX_RESPONSE_CHARS);
    });
  });

  describe('truncationFooter', () => {
    it('should return an empty string when nothing is hidden', () => {
      expect(truncationFooter(0, 'lines', ['maxLines to show more'])).toBe('');
      expect(truncationFooter(-3, 'lines', ['maxLines to show more'])).toBe('');
    });

    it('should include the hidden count and unit', () => {
      const footer = truncationFooter(147, 'lines', ['maxLines to show more']);
      expect(footer).toContain('+147 lines hidden');
    });

    it('should join the hints so every escape hatch is advertised', () => {
      const footer = truncationFooter(30, 'messages', [
        'limit to show more',
        'saveTo to save all to a file',
      ]);
      expect(footer).toBe(
        '[+30 messages hidden; limit to show more, saveTo to save all to a file]'
      );
    });

    it('should omit the hint clause when no hints are given', () => {
      expect(truncationFooter(5, 'requests', [])).toBe('[+5 requests hidden]');
    });
  });
});

/**
 * Extended tests for response helpers
 */

import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse, jsonResponse } from '../../src/utils/response-helpers.js';

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
});

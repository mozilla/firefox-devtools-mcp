/**
 * Unit tests for utilities tools
 */

import { describe, it, expect } from 'vitest';
import {
  acceptDialogTool,
  dismissDialogTool,
  navigateHistoryTool,
  setViewportSizeTool,
} from '../../../src/tools/utilities.js';

describe('Utilities Tools', () => {
  describe('Tool Definitions', () => {
    it('should have correct tool names', () => {
      expect(acceptDialogTool.name).toBe('accept_dialog');
      expect(dismissDialogTool.name).toBe('dismiss_dialog');
      expect(navigateHistoryTool.name).toBe('navigate_history');
      expect(setViewportSizeTool.name).toBe('set_viewport_size');
    });

    it('should have valid descriptions', () => {
      expect(acceptDialogTool.description).toContain('Accept');
      expect(dismissDialogTool.description).toContain('Dismiss');
      expect(navigateHistoryTool.description).toContain('Navigate');
      expect(setViewportSizeTool.description).toContain('viewport');
    });

    it('should have valid input schemas', () => {
      expect(acceptDialogTool.inputSchema.type).toBe('object');
      expect(dismissDialogTool.inputSchema.type).toBe('object');
      expect(navigateHistoryTool.inputSchema.type).toBe('object');
      expect(setViewportSizeTool.inputSchema.type).toBe('object');
    });
  });

  describe('Schema Properties', () => {
    it('acceptDialogTool should accept promptText', () => {
      const { properties } = acceptDialogTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.promptText).toBeDefined();
    });

    it('navigateHistoryTool should require direction with enum', () => {
      const { properties, required } = navigateHistoryTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.direction).toBeDefined();
      expect(properties?.direction.enum).toContain('back');
      expect(properties?.direction.enum).toContain('forward');
      expect(required).toContain('direction');
    });

    it('setViewportSizeTool should require width and height', () => {
      const { properties, required } = setViewportSizeTool.inputSchema;
      expect(properties).toBeDefined();
      expect(properties?.width).toBeDefined();
      expect(properties?.height).toBeDefined();
      expect(required).toContain('width');
      expect(required).toContain('height');
    });
  });
});

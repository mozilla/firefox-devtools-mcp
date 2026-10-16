/**
 * Unit tests for utilities tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  acceptDialogTool,
  handleAcceptDialog,
  handleDismissDialog,
  dismissDialogTool,
  navigateHistoryTool,
  setViewportSizeTool,
} from '../../src/tools/utilities.js';

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

  describe('Dialog handlers', () => {
    const acceptDialog = vi.fn();
    const dismissDialog = vi.fn();

    function errorText(result: { content: Array<{ type: string; text?: string }> }): string {
      return result.content[0]?.text ?? '';
    }

    beforeEach(() => {
      acceptDialog.mockReset();
      dismissDialog.mockReset();
      vi.doMock('../../src/index.js', () => ({
        getFirefox: vi.fn().mockResolvedValue({ acceptDialog, dismissDialog }),
      }));
    });

    it('accept_dialog reports no active dialog for NoSuchAlertError with an empty message', async () => {
      const error = new Error('');
      error.name = 'NoSuchAlertError';
      acceptDialog.mockRejectedValue(error);

      const result = await handleAcceptDialog({});

      expect(result.isError).toBe(true);
      expect(errorText(result)).toBe('Error: No active dialog');
    });

    it('dismiss_dialog reports no active dialog for NoSuchAlertError with an empty message', async () => {
      const error = new Error('');
      error.name = 'NoSuchAlertError';
      dismissDialog.mockRejectedValue(error);

      const result = await handleDismissDialog({});

      expect(result.isError).toBe(true);
      expect(errorText(result)).toBe('Error: No active dialog');
    });

    it('does not treat other errors as a missing dialog', async () => {
      acceptDialog.mockRejectedValue(new Error('Failed to accept dialog: no such alert'));
      dismissDialog.mockRejectedValue(new Error('Failed to dismiss dialog: boom'));

      expect(errorText(await handleAcceptDialog({}))).toBe(
        'Error: Failed to accept dialog: no such alert'
      );
      expect(errorText(await handleDismissDialog({}))).toBe(
        'Error: Failed to dismiss dialog: boom'
      );
    });
  });
});

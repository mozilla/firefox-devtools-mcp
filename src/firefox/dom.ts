/**
 * DOM interactions: evaluate, element lookup, input actions
 */

import { Key } from 'selenium-webdriver';
import type { BrowsingContext, Input, Script } from 'webdriver-bidi-protocol';
import type { BiDiFacade } from './bidi';

/**
 * Key names accepted by press_key. Names are matched case-insensitively.
 */
const KEY_MAP: Record<string, string> = {
  cancel: Key.CANCEL,
  help: Key.HELP,
  backspace: Key.BACK_SPACE,
  tab: Key.TAB,
  clear: Key.CLEAR,
  return: Key.RETURN,
  enter: Key.RETURN,
  numpadenter: Key.ENTER,
  pause: Key.PAUSE,
  escape: Key.ESCAPE,
  esc: Key.ESCAPE,
  space: Key.SPACE,
  pageup: Key.PAGE_UP,
  pagedown: Key.PAGE_DOWN,
  end: Key.END,
  home: Key.HOME,
  arrowleft: Key.ARROW_LEFT,
  left: Key.ARROW_LEFT,
  arrowup: Key.ARROW_UP,
  up: Key.ARROW_UP,
  arrowright: Key.ARROW_RIGHT,
  right: Key.ARROW_RIGHT,
  arrowdown: Key.ARROW_DOWN,
  down: Key.ARROW_DOWN,
  insert: Key.INSERT,
  delete: Key.DELETE,
  semicolon: Key.SEMICOLON,
  equals: Key.EQUALS,
  numpad0: Key.NUMPAD0,
  numpad1: Key.NUMPAD1,
  numpad2: Key.NUMPAD2,
  numpad3: Key.NUMPAD3,
  numpad4: Key.NUMPAD4,
  numpad5: Key.NUMPAD5,
  numpad6: Key.NUMPAD6,
  numpad7: Key.NUMPAD7,
  numpad8: Key.NUMPAD8,
  numpad9: Key.NUMPAD9,
  multiply: Key.MULTIPLY,
  add: Key.ADD,
  separator: Key.SEPARATOR,
  subtract: Key.SUBTRACT,
  decimal: Key.DECIMAL,
  divide: Key.DIVIDE,
  f1: Key.F1,
  f2: Key.F2,
  f3: Key.F3,
  f4: Key.F4,
  f5: Key.F5,
  f6: Key.F6,
  f7: Key.F7,
  f8: Key.F8,
  f9: Key.F9,
  f10: Key.F10,
  f11: Key.F11,
  f12: Key.F12,
};

const MODIFIER_MAP: Record<string, string> = {
  ctrl: Key.CONTROL,
  control: Key.CONTROL,
  alt: Key.ALT,
  shift: Key.SHIFT,
  meta: Key.META,
  cmd: Key.META,
  command: Key.META,
  win: Key.META,
  super: Key.META,
};

export interface KeyCombo {
  modifiers: string[];
  key: string;
}

/**
 * Parse a combination such as "ctrl+shift+t" into its modifiers and its single
 * non-modifier key. Any number of modifiers is allowed, but exactly one key is:
 * "ctrl+k+l" is rejected rather than silently dropping one of the two.
 * Unrecognised names are rejected too, so that a mistyped key name does not turn
 * into typed text.
 * @param combo Key name, single character, or "+"-separated combination
 */
export function parseKeyCombo(combo: string): KeyCombo {
  const trimmed = combo.trim();
  // A lone character is taken literally so that "+" itself can be pressed.
  const parts = [...trimmed].length === 1 ? [trimmed] : trimmed.split('+');

  const modifiers: string[] = [];
  let key: string | undefined;

  for (const part of parts) {
    const name = part.trim();
    if (name === '') {
      continue;
    }

    const lowerName = name.toLowerCase();
    const modifier = Object.hasOwn(MODIFIER_MAP, lowerName) ? MODIFIER_MAP[lowerName] : undefined;
    if (modifier) {
      modifiers.push(modifier);
      continue;
    }

    const mapped = Object.hasOwn(KEY_MAP, lowerName) ? KEY_MAP[lowerName] : undefined;
    if (mapped === undefined && [...name].length > 1) {
      throw new Error(`press_key: unknown key "${name}" in "${combo}"`);
    }
    if (key !== undefined) {
      throw new Error(
        `press_key: "${combo}" has more than one non-modifier key. Use any number of modifiers but a single key, for example "ctrl+shift+t".`
      );
    }
    key = mapped ?? name;
  }

  if (key === undefined) {
    throw new Error(`press_key: no key specified in "${combo}"`);
  }

  return { modifiers, key };
}

export function textKeyActions(text: string): Input.KeySourceAction[] {
  return [...text].flatMap((ch) => [
    { type: 'keyDown', value: ch },
    { type: 'keyUp', value: ch },
  ]);
}

function comboKeyActions({ modifiers, key }: KeyCombo): Input.KeySourceAction[] {
  const actions: Input.KeySourceAction[] = [];
  for (const modifier of modifiers) {
    actions.push({ type: 'keyDown', value: modifier });
  }
  actions.push({ type: 'keyDown', value: key });
  actions.push({ type: 'keyUp', value: key });
  for (const modifier of [...modifiers].reverse()) {
    actions.push({ type: 'keyUp', value: modifier });
  }
  return actions;
}

export class DomInteractions {
  constructor(
    private bidi: BiDiFacade,
    private resolveUid: (
      context: BrowsingContext.BrowsingContext,
      uid: string
    ) => Promise<Script.SharedReference> = () => {
      throw new Error('Not implemented');
    }
  ) {}

  /**
   * Wait until an element is visible, ignoring failures.
   */
  private async waitForVisible(
    context: BrowsingContext.BrowsingContext,
    el: Script.SharedReference,
    timeout = 5000
  ): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const isVisible = await this.bidi.callFunction(
          context,
          'el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })',
          [el]
        );
        if (isVisible) {
          return;
        }
      } catch {
        // Element may not be ready yet
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    // Visibility wait is best-effort; don't throw
  }

  private async scrollAndGetInViewCenterPoint(
    context: BrowsingContext.BrowsingContext,
    el: Script.SharedReference
  ): Promise<{ x: number; y: number }> {
    return await this.bidi.callFunction(
      context,
      `
      async (el) => {
        let rect = el.getBoundingClientRect();
        if (rect.left >= innerWidth || rect.right <= 0 || rect.top >= innerHeight || rect.bottom <= 0) {
          el.scrollIntoView({ behavior: "instant" });
          rect = el.getBoundingClientRect();
        }
        const left = Math.min(Math.max(rect.left, 0), innerWidth);
        const right = Math.min(Math.max(rect.right, 0), innerWidth);
        const top = Math.min(Math.max(rect.top, 0), innerHeight);
        const bottom = Math.min(Math.max(rect.bottom, 0), innerHeight);
        return { x: (left + right) / 2, y: (top + bottom) / 2 };
      }
      `,
      [el]
    );
  }

  private async sendKeyActions(
    context: BrowsingContext.BrowsingContext,
    actions: Input.KeySourceAction[]
  ): Promise<void> {
    await this.bidi.sendCommand('input.performActions', {
      context,
      actions: [{ type: 'key', id: 'mcp_keyboard', actions }],
    });
  }

  private async sendPointerActions(
    context: BrowsingContext.BrowsingContext,
    actions: Input.PointerSourceAction[]
  ): Promise<void> {
    await this.bidi.sendCommand('input.performActions', {
      context,
      actions: [{ type: 'pointer', id: 'mcp_mouse', actions }],
    });
  }

  // ============================================================================
  // UID-based input methods
  // ============================================================================

  /**
   * Click element by UID
   * Requires resolveUid callback to be set (from SnapshotManager)
   */
  async clickByUid(
    context: BrowsingContext.BrowsingContext,
    uid: string,
    dblClick = false
  ): Promise<void> {
    const el = await this.resolveUid(context, uid);
    await this.waitForVisible(context, el);
    const { x, y } = await this.scrollAndGetInViewCenterPoint(context, el);
    const actions: Input.PointerSourceAction[] = [
      { type: 'pointerMove', x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerUp', button: 0 },
    ];
    if (dblClick) {
      actions.push({ type: 'pointerDown', button: 0 });
      actions.push({ type: 'pointerUp', button: 0 });
    }
    await this.sendPointerActions(context, actions);
  }

  /**
   * Hover over element by UID
   */
  async hoverByUid(context: BrowsingContext.BrowsingContext, uid: string): Promise<void> {
    const el = await this.resolveUid(context, uid);
    await this.waitForVisible(context, el);
    const { x, y } = await this.scrollAndGetInViewCenterPoint(context, el);
    await this.sendPointerActions(context, [{ type: 'pointerMove', x, y }]);
  }

  /**
   * Fill input field by UID
   */
  async fillByUid(
    context: BrowsingContext.BrowsingContext,
    uid: string,
    value: string
  ): Promise<void> {
    const el = await this.resolveUid(context, uid);
    await this.bidi.callFunction(
      context,
      `
      (el) => {
        if (el.nodeName === 'INPUT' || el.nodeName === 'TEXTAREA') {
          el.value = '';
        } else if (el.isContentEditable) {
         el.textContent = '';
        }
        el.focus();
      }
      `,
      [el]
    );
    await this.sendKeyActions(context, textKeyActions(value));
  }

  /**
   * Drag & drop by UIDs
   * Uses JS events fallback for better compatibility
   */
  async dragByUidToUid(
    context: BrowsingContext.BrowsingContext,
    fromUid: string,
    toUid: string
  ): Promise<void> {
    const [sourceElement, targetElement] = await Promise.all([
      this.resolveUid(context, fromUid),
      this.resolveUid(context, toUid),
    ]);
    // Use JS drag events fallback for compatibility (Actions DnD not used)
    await this.bidi.callFunction(
      context,
      `
      (src, tgt) => {
        function dispatch(type, target, dt) {
          var evt = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
          return target.dispatchEvent(evt);
        }
        var dt = typeof DataTransfer !== 'undefined' ? new DataTransfer() : undefined;
        dispatch('dragstart', src, dt);
        dispatch('dragenter', tgt, dt);
        dispatch('dragover', tgt, dt);
        dispatch('drop', tgt, dt);
        dispatch('dragend', src, dt);
      }
      `,
      [sourceElement, targetElement]
    );
  }

  /**
   * Fill multiple form fields by UIDs
   */
  async fillFormByUid(
    context: BrowsingContext.BrowsingContext,
    elements: Array<{ uid: string; value: string }>
  ): Promise<void> {
    for (const { uid, value } of elements) {
      await this.fillByUid(context, uid, value);
    }
  }

  /**
   * Upload file by UID
   * Handles hidden file inputs by making them visible
   */
  async uploadFileByUid(
    context: BrowsingContext.BrowsingContext,
    uid: string,
    filePath: string
  ): Promise<void> {
    const el = await this.resolveUid(context, uid);
    // Ensure it's an <input type=file>; if hidden, unhide via JS
    await this.bidi.callFunction(
      context,
      `
      (element) => {
        if (element.tagName !== 'INPUT' || element.type !== 'file')
          throw new Error('uploadFile: element must be <input type=file>');
        var style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          var s = element.style;
          s.display = 'block'; s.visibility = 'visible'; s.opacity = '1';
          s.position = 'fixed'; s.left = '0px'; s.top = '0px';
          s.zIndex = '2147483647';
        }
        element.focus();
      }
      `,
      [el]
    );
    await this.sendKeyActions(context, textKeyActions(filePath));
  }

  /**
   * Press a single key, optionally with modifiers.
   * @param key Key name or combination, such as "Escape", "Enter" or "ctrl+shift+t"
   * @param uid Element UID to focus first. Defaults to the focused element.
   */
  async pressKey(
    context: BrowsingContext.BrowsingContext,
    key: string,
    uid?: string
  ): Promise<void> {
    if (uid) {
      // If a uid was provided, focus the element first so that actions will be
      // applied to it.
      await this.focusByUid(context, uid);
    }
    await this.sendKeyActions(context, comboKeyActions(parseKeyCombo(key)));
  }

  /**
   * Type text key by key, optionally followed by a single key press.
   * @param text Text to type
   * @param options.uid Element UID to focus first. Defaults to the focused element.
   * @param options.submitKey Key to press after the text, such as "Enter" or "Tab"
   */
  async typeText(
    context: BrowsingContext.BrowsingContext,
    text: string,
    options: { uid?: string | undefined; submitKey?: string | undefined } = {}
  ): Promise<void> {
    // Parsed up front so that an invalid key fails before anything is typed.
    const submit = options.submitKey === undefined ? undefined : parseKeyCombo(options.submitKey);

    if (options.uid) {
      await this.focusByUid(context, options.uid);
    }

    // One sequence, so that the text and the key land on the same element.
    const actions = textKeyActions(text);
    if (submit) {
      actions.push(...comboKeyActions(submit));
    }
    await this.sendKeyActions(context, actions);
  }

  /**
   * Focus the element for the provided uid. Throws if the element cannot be
   * focused.
   */
  private async focusByUid(context: BrowsingContext.BrowsingContext, uid: string): Promise<void> {
    const el = await this.resolveUid(context, uid);
    await this.waitForVisible(context, el, 5000);
    const focused = await this.bidi.callFunction(
      context,
      '(el) => { el.focus(); return el.getRootNode().activeElement === el; }',
      [el]
    );
    if (!focused) {
      throw new Error(
        `pressKey: uid ${uid} cannot receive keyboard focus. Target a focusable element, or omit uid to send the key to the currently focused element.`
      );
    }
  }

  // ============================================================================
  // Screenshot
  // ============================================================================

  /**
   * Take screenshot of the entire page
   * @param fullPage Capture the whole document via the Firefox-only full screenshot endpoint
   * @returns PNG as base64 string
   */
  async takeScreenshotPage(
    context: BrowsingContext.BrowsingContext,
    fullPage = false
  ): Promise<string> {
    const result = await this.bidi.sendCommand('browsingContext.captureScreenshot', {
      context,
      format: { type: 'png' },
      origin: fullPage ? 'document' : 'viewport',
    });
    return result.data;
  }

  /**
   * Take screenshot of element by UID
   * Scrolls element into view, then captures it
   * @param uid Element UID from snapshot
   * @returns PNG as base64 string
   */
  async takeScreenshotByUid(
    context: BrowsingContext.BrowsingContext,
    uid: string
  ): Promise<string> {
    const el = await this.resolveUid(context, uid);
    await this.waitForVisible(context, el);
    await this.scrollAndGetInViewCenterPoint(context, el);

    // Take screenshot of element (WebDriver BiDi automatically crops to element bounds)
    const result = await this.bidi.sendCommand('browsingContext.captureScreenshot', {
      context,
      format: { type: 'png' },
      clip: { type: 'element', element: el },
    });
    return result.data;
  }
}

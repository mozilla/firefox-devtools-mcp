import EventEmitter from 'node:events';
import { WebDriver } from 'selenium-webdriver';
import type {
  BrowsingContext,
  Commands,
  Event,
  EmptyParams,
  EmptyResult,
  Network,
} from 'webdriver-bidi-protocol';
import { logDebug } from '../utils/logger.js';

// Firefox-specific events
type DebuggingPausedEvent = {
  method: 'moz:debugging.paused';
  params: { context: BrowsingContext.BrowsingContext; url: string; line: number; column: number };
};
type DebuggingResumedEvent = {
  method: 'moz:debugging.resumed';
  params: { context: BrowsingContext.BrowsingContext };
};
type FirefoxEvent = Event | DebuggingPausedEvent | DebuggingResumedEvent;
type FirefoxEventMap = {
  [M in FirefoxEvent['method']]: [Extract<FirefoxEvent, { method: M }>['params']];
};
type FirefoxEventName = keyof FirefoxEventMap;

export type FirefoxCommands = Commands & {
  // Firefox-specific extensions to standard commands
  'browsingContext.getTree': {
    params: { 'moz:scope'?: string };
  };
  'webExtension.install': {
    params: { 'moz:permanent'?: boolean };
  };
  // Firefox-specific commands
  'moz:debugging.setDebuggerEnabled': {
    params: { enabled: boolean };
    returnType: EmptyResult;
  };
  'moz:debugging.setBreakpoint': {
    params: { location: { url: string; line: number } };
    returnType: { breakpoint: string };
  };
  'moz:debugging.removeBreakpoint': {
    params: { breakpoint: string };
    returnType: EmptyResult;
  };
  'moz:debugging.resume': {
    params: { context: BrowsingContext.BrowsingContext };
    returnType: EmptyResult;
  };
  'moz:debugging.listScripts': {
    params: { context: BrowsingContext.BrowsingContext };
    returnType: { scripts: string[] };
  };
  'moz:debugging.getScriptSource': {
    params: { context: BrowsingContext.BrowsingContext; scriptUrl: string };
    returnType: { source: string };
  };
  'moz:profiler.start': {
    params: EmptyParams;
    returnType: { active: boolean };
  };
  'moz:profiler.stop': {
    params: { discard?: boolean };
    returnType: { path?: string };
  };
  'moz:profiler.isActive': {
    params: EmptyParams;
    returnType: { active: boolean };
  };
};

// webdriver-bidi-protocol uses ambient const enums AND we're using vitest
// which implies typescript's isolatedModules is true, meaning that
// these enums are not available at runtime, so we create these helpers
// for easier access to the correctly typed values
export const ReadinessState = {
  None: 'none' as BrowsingContext.ReadinessState,
  Interactive: 'interactive' as BrowsingContext.ReadinessState,
  Complete: 'complete' as BrowsingContext.ReadinessState,
} as const satisfies Record<
  keyof typeof BrowsingContext.ReadinessState,
  BrowsingContext.ReadinessState
>;

export const DataType = {
  Request: 'request' as Network.DataType,
  Response: 'response' as Network.DataType,
} as const satisfies Record<keyof typeof Network.DataType, Network.DataType>;

export class BiDiFacade extends EventEmitter<FirefoxEventMap> {
  private listening = false;
  private nextCommandId = 1;

  constructor(private readonly driver: WebDriver) {
    super();
  }

  async subscribe(events: FirefoxEventName | FirefoxEventName[]) {
    const bidi = await this.driver.getBidi();
    if (!this.listening) {
      this.listenForEvents(bidi.socket);
      this.listening = true;
    }
    await bidi.subscribe(events);
  }

  async sendCommand<T extends keyof FirefoxCommands>(
    method: T,
    params: FirefoxCommands[T]['params'] = {}
  ): Promise<FirefoxCommands[T]['returnType']> {
    const bidi = await this.driver.getBidi();
    // bidi.socket is a Node.js `ws` WebSocket (EventEmitter-style), but typed as browser WebSocket
    const ws = bidi.socket as any;

    // Wait for WebSocket to be ready before sending
    await this.waitForWebSocketOpen(ws);

    const id = this.nextCommandId++;

    return new Promise((resolve, reject) => {
      const messageHandler = (data: any) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.id === id) {
            ws.off('message', messageHandler);
            if (payload.error) {
              reject(new Error(`BiDi error: ${JSON.stringify(payload.error)}`));
            } else {
              resolve(payload.result);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.on('message', messageHandler);

      const command = {
        id,
        method,
        params,
      };

      ws.send(JSON.stringify(command));

      setTimeout(() => {
        ws.off('message', messageHandler);
        reject(new Error(`BiDi command timeout: ${method}`));
      }, 10000);
    });
  }

  private listenForEvents(ws: any) {
    ws.on('message', (data: any) => {
      let payload: any;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        // ignore parse errors
        return;
      }
      if (payload?.type === 'event' && payload.method) {
        try {
          this.emit(payload.method, payload.params);
        } catch (error) {
          logDebug(
            `Error emitting ${payload.method} event: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    });
  }

  /**
   * Wait for WebSocket to be in OPEN state
   */
  private async waitForWebSocketOpen(ws: any, timeout: number = 5000): Promise<void> {
    // Already open
    if (ws.readyState === 1) {
      return;
    }

    // Still connecting - wait for open event with timeout
    if (ws.readyState === 0) {
      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          ws.off('open', onOpen);
          reject(new Error('Timeout waiting for WebSocket to open'));
        }, timeout);

        const onOpen = () => {
          clearTimeout(timeoutId);
          ws.off('open', onOpen);
          resolve();
        };
        ws.on('open', onOpen);
      });
    }

    throw new Error(`WebSocket is not open: readyState ${ws.readyState}`);
  }
}

/**
 * WebDriver BiDi types for Firefox
 */

export type BrowsingContextId = string;

/**
 * BiDi browsing context (tab/window)
 */
export interface BrowsingContext {
  context: BrowsingContextId;
  url: string;
  title?: string;
  children?: BrowsingContext[];
  parent?: BrowsingContextId;
}

/**
 * BiDi console log entry
 */
export interface ConsoleMessage {
  level: 'debug' | 'info' | 'warn' | 'error';
  text: string;
  timestamp: number;
  source?: string;
  args?: unknown[];
}

/**
 * Combined network request+response record
 */
export interface NetworkRecord {
  id: string;
  url: string;
  method: string;
  timestamp: number;
  resourceType?: string;
  isXHR?: boolean;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timings?: {
    requestTime?: number;
    responseTime?: number;
    duration?: number;
  };
}

/**
 * Firefox launch options
 */
export interface FirefoxLaunchOptions {
  firefoxPath?: string | undefined;
  headless: boolean;
  profilePath?: string | undefined;
  viewport?: { width: number; height: number } | undefined;
  args?: string[] | undefined;
  startUrl?: string | undefined;
  acceptInsecureCerts?: boolean | undefined;
  connectExisting?: boolean | undefined;
  marionettePort?: number | undefined;
}

/**
 * BiDi command structure
 */
export interface BiDiCommand {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

/**
 * BiDi response structure
 */
export interface BiDiResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: {
    error: string;
    message: string;
    stacktrace?: string;
  };
  method?: string;
  params?: Record<string, unknown>;
}

/**
 * BiDi error
 */
export class BiDiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'BiDiError';
  }
}

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
 * A tracked download, correlated across downloadWillBegin and downloadEnd
 */
export interface DownloadRecord {
  /** BiDi download UUID, shared between the begin and end events */
  id: string;
  context: string;
  navigation: string | null;
  url: string;
  suggestedFilename: string;
  status: 'in_progress' | 'complete' | 'canceled';
  startTimestamp: number;
  endTimestamp?: number;
  durationMs?: number;
  /** Final saved path, present only when status is 'complete' */
  filepath?: string;
}

/**
 * A single result captured by a logpoint hit
 */
export interface LogpointResult {
  value: unknown;
  error?: string;
  timestamp: number;
}

/**
 * Firefox launch options
 */
export interface FirefoxLaunchOptions {
  firefoxPath?: string | undefined;
  headless?: boolean | undefined;
  profilePath?: string | undefined;
  viewport?: { width: number; height: number } | undefined;
  args?: string[] | undefined;
  startUrl?: string | undefined;
  acceptInsecureCerts?: boolean | undefined;
  connectExisting?: boolean | undefined;
  marionettePort?: number | undefined;
  /** Lookup the Marionette port from Firefox's AI assistant companion instead of using marionettePort */
  lookupMarionettePort?: boolean | undefined;
  env?: Record<string, string> | undefined;
  logFile?: string | undefined;
  /** Firefox preferences to set at startup via moz:firefoxOptions */
  prefs?: Record<string, string | number | boolean> | undefined;
  /** Android device serial; omit to auto-select the single connected device */
  androidDevice?: string | undefined;
  /** Android app package name (default: org.mozilla.firefox) */
  androidPackage?: string | undefined;
  /** Acknowledge that Android mode wipes all data of the target app; required to launch on Android */
  androidWipeAppData?: boolean | undefined;
  /** Capture network request/response bodies via BiDi data collectors (default: true) */
  captureNetworkBodies?: boolean | undefined;
}

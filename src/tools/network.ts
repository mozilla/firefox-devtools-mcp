/**
 * Network monitoring tools for Firefox DevTools MCP
 * Provides network request inspection capabilities
 */

import type { Network } from 'webdriver-bidi-protocol';
import type { FirefoxClient } from '../firefox/index.js';
import { DataType } from '../firefox/bidi.js';
import {
  successResponse,
  errorResponse,
  jsonResponse,
  truncateHeaders,
  truncateText,
  previewExcerpt,
  truncationFooter,
  TOKEN_LIMITS,
} from '../utils/response-helpers.js';
import { saveOutput } from '../utils/save-output.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';
import type { NetworkBodyResult } from '../firefox/events/network.js';
import { CACHE_BEHAVIORS, isCacheBehavior } from '../firefox/cache.js';

// Tool definitions
export const listNetworkRequestsTool = {
  name: 'list_network_requests',
  description:
    'List network requests, returning IDs for get_network_request. Filter by url/method/status; caps at limit (default 50); saveTo saves all matches to a file.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max requests (default: 50)',
      },
      sinceMs: {
        type: 'number',
        description: 'Only last N ms',
      },
      urlContains: {
        type: 'string',
        description: 'URL filter (case-insensitive)',
      },
      method: {
        type: 'string',
        description: 'HTTP method filter',
      },
      status: {
        type: 'number',
        description: 'Exact status code',
      },
      statusMin: {
        type: 'number',
        description: 'Min status code',
      },
      statusMax: {
        type: 'number',
        description: 'Max status code',
      },
      isXHR: {
        type: 'boolean',
        description: 'XHR/fetch only',
      },
      resourceType: {
        type: 'string',
        description: 'Resource type filter',
      },
      sortBy: {
        type: 'string',
        enum: ['timestamp', 'duration', 'status'],
        description: 'Sort field (default: timestamp)',
      },
      detail: {
        type: 'string',
        enum: ['summary', 'min', 'full'],
        description: 'Detail level (default: summary)',
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: 'Output format (default: text)',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save matching requests to a file as JSON instead of returning them inline. Saves full untruncated headers by default; pass detail=summary or min for a lean form, or an explicit limit to cap how many are saved (default: all matching). Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved output to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
  },
} satisfies ToolDefinition;

export const getNetworkRequestTool = {
  name: 'get_network_request',
  description:
    'Get request details by ID, including the response body (and request body when present). Large text bodies are truncated inline; binary bodies are summarized. URL lookup as fallback.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Request ID from list_network_requests',
      },
      url: {
        type: 'string',
        description: 'URL fallback (may match multiple)',
      },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: 'Output format (default: text)',
      },
      saveTo: {
        type: ['boolean', 'string'],
        description:
          'Save the request details with full untruncated headers and bodies to a file as JSON instead of returning them inline (binary bodies are stored base64-encoded). Pass a file path, an existing directory (generated file inside), or true (generated file under ~/.firefox-devtools-mcp/output/). Relative paths resolve against the current working directory.',
      },
      preview: {
        type: 'number',
        description:
          'Number of characters of the saved output to return inline as a preview when saveTo is used. Omit for no preview.',
      },
    },
  },
} satisfies ToolDefinition;

export const setNetworkCacheTool = {
  name: 'set_network_cache',
  description:
    "Control the HTTP cache. Use behavior='bypass' so every request goes to the network — useful for performance measurement and for verifying a change that a cached asset would otherwise hide. Applies to the currently selected tab unless scope='global'. Persists until set back to 'default' or Firefox shuts down.",
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      behavior: {
        type: 'string',
        enum: [...CACHE_BEHAVIORS],
        description: "'bypass' to skip the cache, 'default' to restore normal caching",
      },
      scope: {
        type: 'string',
        enum: ['tab', 'global'],
        description: "'tab' (default) applies to the selected tab; 'global' applies browser-wide",
      },
    },
    required: ['behavior'],
  },
} satisfies ToolDefinition;

/**
 * Fetch a body without letting a missing facade method or transport error fail
 * the whole tool call. Absent support degrades to an 'unsupported' marker.
 */
async function safeFetchBody(
  firefox: FirefoxClient,
  id: string,
  dataType: Network.DataType
): Promise<NetworkBodyResult> {
  if (typeof firefox.getNetworkRequestBody !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    return await firefox.getNetworkRequestBody(id, dataType);
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function bodyUnavailableMarker(reason: string): string {
  switch (reason) {
    case 'unsupported':
      return '<not captured: body collection not supported by this Firefox>';
    case 'not-collected':
      return '<not captured>';
    case 'evicted':
      return '<not available: evicted from the capture buffer>';
    case 'aborted':
      return '<not available: collection aborted>';
    default:
      return '<not available>';
  }
}

/** A request body is only worth surfacing when it existed on the wire. */
function hasRequestBody(result: NetworkBodyResult): boolean {
  return result.ok || result.reason === 'evicted' || result.reason === 'aborted';
}

function renderBodyInline(result: NetworkBodyResult): { body: string; encoding?: 'base64' } {
  if (!result.ok) {
    return { body: bodyUnavailableMarker(result.reason) };
  }
  if (result.type === 'base64') {
    const approxKb = ((result.value.length * 3) / 4 / 1024).toFixed(1);
    return {
      body: `<binary data (~${approxKb}KB); use saveTo to retrieve the full body>`,
      encoding: 'base64',
    };
  }
  return { body: truncateText(result.value, TOKEN_LIMITS.MAX_RESPONSE_CHARS) };
}

function renderBodyForFile(result: NetworkBodyResult): {
  body: string | null;
  encoding: 'base64' | 'utf-8' | null;
  unavailable?: string;
} {
  if (!result.ok) {
    return { body: null, encoding: null, unavailable: result.reason };
  }
  return {
    body: result.value,
    encoding: result.type === 'base64' ? 'base64' : 'utf-8',
  };
}

// Tool handlers
export const handleListNetworkRequests = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const {
      limit,
      sinceMs,
      urlContains,
      method,
      status,
      statusMin,
      statusMax,
      isXHR,
      resourceType,
      sortBy = 'timestamp',
      detail,
      format = 'text',
      saveTo,
      preview,
    } = (args as {
      limit?: number;
      sinceMs?: number;
      urlContains?: string;
      method?: string;
      status?: number;
      statusMin?: number;
      statusMax?: number;
      isXHR?: boolean;
      resourceType?: string;
      sortBy?: 'timestamp' | 'duration' | 'status';
      detail?: 'summary' | 'min' | 'full';
      format?: 'text' | 'json';
      saveTo?: boolean | string;
      preview?: number;
    }) || {};

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    let requests = await firefox.getNetworkRequests();

    // Apply time filter
    if (sinceMs !== undefined) {
      const cutoffTime = Date.now() - sinceMs;
      requests = requests.filter((req) => req.timestamp && req.timestamp >= cutoffTime);
    }

    // Apply filters
    if (urlContains) {
      const urlLower = urlContains.toLowerCase();
      requests = requests.filter((req) => req.url.toLowerCase().includes(urlLower));
    }

    if (method) {
      const methodUpper = method.toUpperCase();
      requests = requests.filter((req) => req.method.toUpperCase() === methodUpper);
    }

    if (status !== undefined) {
      requests = requests.filter((req) => req.status === status);
    }

    if (statusMin !== undefined) {
      requests = requests.filter((req) => req.status !== undefined && req.status >= statusMin);
    }

    if (statusMax !== undefined) {
      requests = requests.filter((req) => req.status !== undefined && req.status <= statusMax);
    }

    if (isXHR !== undefined) {
      requests = requests.filter((req) => req.isXHR === isXHR);
    }

    if (resourceType) {
      const typeLower = resourceType.toLowerCase();
      requests = requests.filter((req) => req.resourceType?.toLowerCase() === typeLower);
    }

    // Sort requests
    if (sortBy === 'timestamp') {
      requests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (sortBy === 'duration') {
      requests.sort((a, b) => (b.timings?.duration || 0) - (a.timings?.duration || 0));
    } else if (sortBy === 'status') {
      requests.sort((a, b) => (a.status || 0) - (b.status || 0));
    }

    if (saveTo) {
      // Full untruncated headers by default on save; an explicit summary/min
      // detail selects a lean form. An explicit limit selects the top-N by the
      // current sort; otherwise all matching requests are saved.
      const selected = limit !== undefined ? requests.slice(0, limit) : requests;
      const fileDetail = detail ?? 'full';
      const fileBody = JSON.stringify(
        {
          total: requests.length,
          saved: selected.length,
          detail: fileDetail,
          requests: selected.map((req) =>
            fileDetail === 'full'
              ? {
                  id: req.id,
                  url: req.url,
                  method: req.method,
                  status: req.status ?? null,
                  statusText: req.statusText ?? null,
                  resourceType: req.resourceType ?? null,
                  isXHR: req.isXHR ?? false,
                  timestamp: req.timestamp ?? null,
                  timings: req.timings ?? null,
                  requestHeaders: req.requestHeaders ?? null,
                  responseHeaders: req.responseHeaders ?? null,
                }
              : {
                  id: req.id,
                  url: req.url,
                  method: req.method,
                  status: req.status ?? null,
                  statusText: req.statusText ?? null,
                  resourceType: req.resourceType ?? null,
                  isXHR: req.isXHR ?? false,
                  duration: req.timings?.duration ?? null,
                }
          ),
        },
        null,
        2
      );
      const saved = await saveOutput(
        fileBody,
        saveTo === true ? undefined : saveTo,
        'network-requests'
      );
      let output = `Network requests saved to: ${saved.path} (${selected.length} of ${requests.length} matching, ${(saved.bytes / 1024).toFixed(1)}KB)`;
      const excerpt = previewExcerpt(fileBody, preview);
      if (excerpt) {
        output += '\nPreview:\n```json\n' + excerpt + '\n```';
      }
      return successResponse(output);
    }

    // Apply limit
    const effectiveLimit = limit ?? 50;
    const effectiveDetail = detail ?? 'summary';
    const limitedRequests = requests.slice(0, effectiveLimit);
    const hasMore = requests.length > effectiveLimit;
    const moreFooter = hasMore
      ? '\n' +
        truncationFooter(requests.length - limitedRequests.length, 'requests', [
          'limit to show more',
          'urlContains/method/status to filter',
          'saveTo to save all to a file',
        ])
      : '';

    // Format output based on detail level and format
    if (format === 'json') {
      // JSON format - return structured data based on detail level
      const responseData: any = {
        total: requests.length,
        showing: limitedRequests.length,
        hasMore,
        requests: [],
      };

      if (effectiveDetail === 'summary' || effectiveDetail === 'min') {
        responseData.requests = limitedRequests.map((req) => ({
          id: req.id,
          url: req.url,
          method: req.method,
          status: req.status,
          statusText: req.statusText,
          resourceType: req.resourceType,
          isXHR: req.isXHR,
          duration: req.timings?.duration,
        }));
      } else {
        // Full detail - apply header truncation to prevent token overflow
        responseData.requests = limitedRequests.map((req) => ({
          id: req.id,
          url: req.url,
          method: req.method,
          status: req.status,
          statusText: req.statusText,
          resourceType: req.resourceType,
          isXHR: req.isXHR,
          timings: req.timings || null,
          requestHeaders: truncateHeaders(req.requestHeaders),
          responseHeaders: truncateHeaders(req.responseHeaders),
        }));
      }

      return jsonResponse(responseData);
    }

    // Text format (default)
    if (effectiveDetail === 'summary') {
      const formattedRequests = limitedRequests.map((req) => {
        const statusInfo = req.status
          ? `[${req.status}${req.statusText ? ' ' + req.statusText : ''}]`
          : '[pending]';
        return `${req.id} | ${req.method} ${req.url} ${statusInfo}${req.isXHR ? ' (XHR)' : ''}`;
      });

      const header = `[network] ${requests.length} requests${hasMore ? ` (limit ${effectiveLimit})` : ''}\n`;
      return successResponse(header + formattedRequests.join('\n') + moreFooter);
    } else if (effectiveDetail === 'min') {
      // Compact JSON
      const minData = limitedRequests.map((req) => ({
        id: req.id,
        url: req.url,
        method: req.method,
        status: req.status,
        statusText: req.statusText,
        resourceType: req.resourceType,
        isXHR: req.isXHR,
        duration: req.timings?.duration,
      }));

      return successResponse(
        `[network] ${requests.length} requests${hasMore ? ` (limit ${effectiveLimit})` : ''}\n` +
          JSON.stringify(minData, null, 2) +
          moreFooter
      );
    } else {
      // Full JSON including headers - apply truncation to prevent token overflow
      const fullData = limitedRequests.map((req) => ({
        id: req.id,
        url: req.url,
        method: req.method,
        status: req.status,
        statusText: req.statusText,
        resourceType: req.resourceType,
        isXHR: req.isXHR,
        timings: req.timings || null,
        requestHeaders: truncateHeaders(req.requestHeaders),
        responseHeaders: truncateHeaders(req.responseHeaders),
      }));

      return successResponse(
        `[network] ${requests.length} requests${hasMore ? ` (limit ${effectiveLimit})` : ''}\n` +
          JSON.stringify(fullData, null, 2) +
          moreFooter
      );
    }
  }
);

export const handleGetNetworkRequest = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { id, url, format, saveTo, preview } = args as {
      id?: string;
      url?: string;
      format?: 'text' | 'json';
      saveTo?: boolean | string;
      preview?: number;
    };

    if (!id && !url) {
      return errorResponse('id or url required');
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    const requests = await firefox.getNetworkRequests();
    let request = null;

    // Primary path: lookup by ID
    if (id) {
      request = requests.find((req) => req.id === id);
      if (!request) {
        return errorResponse(`ID ${id} not found`);
      }
    } else if (url) {
      // Fallback: lookup by URL (with collision detection)
      const matches = requests.filter((req) => req.url === url);

      if (matches.length === 0) {
        return errorResponse(`URL not found: ${url}`);
      }

      if (matches.length > 1) {
        const ids = matches.map((req) => req.id).join(', ');
        return errorResponse(`Multiple matches, use id: ${ids}`);
      }

      request = matches[0];
    }

    if (!request) {
      return errorResponse('Request not found');
    }

    const fullDetails = {
      id: request.id,
      url: request.url,
      method: request.method,
      status: request.status ?? null,
      statusText: request.statusText ?? null,
      resourceType: request.resourceType ?? null,
      isXHR: request.isXHR ?? false,
      timestamp: request.timestamp ?? null,
      timings: request.timings ?? null,
      requestHeaders: request.requestHeaders ?? null,
      responseHeaders: request.responseHeaders ?? null,
    };

    const [responseBodyResult, requestBodyResult] = await Promise.all([
      safeFetchBody(firefox, request.id, DataType.Response),
      safeFetchBody(firefox, request.id, DataType.Request),
    ]);

    if (saveTo) {
      const responseFile = renderBodyForFile(responseBodyResult);
      const fileObject: Record<string, unknown> = {
        ...fullDetails,
        responseBody: responseFile.body,
        responseBodyEncoding: responseFile.encoding,
      };
      if (responseFile.unavailable) {
        fileObject.responseBodyUnavailable = responseFile.unavailable;
      }
      if (hasRequestBody(requestBodyResult)) {
        const requestFile = renderBodyForFile(requestBodyResult);
        fileObject.requestBody = requestFile.body;
        fileObject.requestBodyEncoding = requestFile.encoding;
        if (requestFile.unavailable) {
          fileObject.requestBodyUnavailable = requestFile.unavailable;
        }
      }

      const fileBody = JSON.stringify(fileObject, null, 2);
      const saved = await saveOutput(
        fileBody,
        saveTo === true ? undefined : saveTo,
        'network-request'
      );
      let output = `Request ${request.id} saved to: ${saved.path} (${(saved.bytes / 1024).toFixed(1)}KB)`;
      const excerpt = previewExcerpt(fileBody, preview);
      if (excerpt) {
        output += '\nPreview:\n```json\n' + excerpt + '\n```';
      }
      return successResponse(output);
    }

    // Apply header truncation to prevent token overflow
    const responseInline = renderBodyInline(responseBodyResult);
    const details: Record<string, unknown> = {
      ...fullDetails,
      requestHeaders: truncateHeaders(request.requestHeaders),
      responseHeaders: truncateHeaders(request.responseHeaders),
      responseBody: responseInline.body,
    };
    if (responseInline.encoding) {
      details.responseBodyEncoding = responseInline.encoding;
    }
    if (hasRequestBody(requestBodyResult)) {
      const requestInline = renderBodyInline(requestBodyResult);
      details.requestBody = requestInline.body;
      if (requestInline.encoding) {
        details.requestBodyEncoding = requestInline.encoding;
      }
    }

    if (format === 'json') {
      return jsonResponse(details);
    }

    return successResponse(JSON.stringify(details, null, 2));
  }
);

export const handleSetNetworkCache = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { behavior, scope } = (args as { behavior?: unknown; scope?: unknown }) || {};

    // An unrecognised value is rejected rather than defaulting: silently caching
    // when the caller asked to bypass would quietly invalidate their measurement.
    if (!isCacheBehavior(behavior)) {
      return errorResponse(
        `behavior must be one of ${CACHE_BEHAVIORS.join(', ')} (got ${JSON.stringify(behavior)})`
      );
    }
    if (scope !== undefined && scope !== 'tab' && scope !== 'global') {
      return errorResponse(`scope must be 'tab' or 'global' (got ${JSON.stringify(scope)})`);
    }

    const isGlobal = scope === 'global';

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();

    await firefox.setCacheBehavior(behavior, { global: isGlobal });

    return successResponse(
      `cache ${behavior} (${isGlobal ? 'all tabs' : 'selected tab'})` +
        (behavior === 'bypass' ? " — set behavior='default' to restore caching" : '')
    );
  }
);

export const module = defineModule({
  name: 'network',
  description: 'List and inspect network requests, and control the HTTP cache.',
  tools: [
    [listNetworkRequestsTool, handleListNetworkRequests],
    [getNetworkRequestTool, handleGetNetworkRequest],
    [setNetworkCacheTool, handleSetNetworkCache],
  ],
});

import type { BrowsingContext } from 'webdriver-bidi-protocol';
import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { compareVersions } from '../utils/version.js';
import type { FirefoxDevTools } from '../firefox/index.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';
import type { McpToolResponse } from '../types/common.js';

const MIN_FIREFOX_VERSION = '154.0';

function checkScreencastSupported(firefox: FirefoxDevTools): void {
  const version = firefox.getFirefoxVersion();
  if (version !== null && compareVersions(version, MIN_FIREFOX_VERSION) < 0) {
    throw new Error(
      `Screencast recording requires Firefox ${MIN_FIREFOX_VERSION.split('.')[0]} or later (connected: ${version})`
    );
  }
}

interface ActiveRecording {
  path: string;
  context: string;
}

// Maps screencast ids returned by browsingContext.startScreencast to their recording info.
const activeRecordings = new Map<string, ActiveRecording>();

// ============================================================================
// Tool: screencast_start
// ============================================================================

export const screencastStartTool = {
  name: 'screencast_start',
  description:
    'Start recording a screencast (video) of the current page viewport, saving the output to a file in the downloads directory. Returns a screencast id to pass to screencast_stop. Multiple recordings can run at once.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description:
          'Id of the top-level browsing context to record. Defaults to the currently selected page.',
      },
      frameRate: {
        type: 'integer',
        description: 'Target frame rate of the recording, in frames per second.',
      },
      width: {
        type: 'integer',
        description: 'Width of the recorded video in pixels. Defaults to the viewport width.',
      },
      height: {
        type: 'integer',
        description: 'Height of the recorded video in pixels. Defaults to the viewport height.',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the output file. Defaults to "video/webm".',
      },
    },
  },
} satisfies ToolDefinition;

export const handleScreencastStart = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { context, frameRate, width, height, mimeType } = (args ?? {}) as {
      context?: string;
      frameRate?: number;
      width?: number;
      height?: number;
      mimeType?: string;
    };

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkScreencastSupported(firefox);

    const contextId = context ?? firefox.getCurrentContextId();
    if (!contextId) {
      throw new Error('No active browsing context to record');
    }

    const params: BrowsingContext.StartScreencastParameters = { context: contextId };

    const video: Record<string, number> = {};
    if (frameRate !== undefined) {
      video.frameRate = frameRate;
    }
    if (width !== undefined) {
      video.width = width;
    }
    if (height !== undefined) {
      video.height = height;
    }
    if (Object.keys(video).length > 0) {
      params.video = video;
    }

    if (mimeType !== undefined) {
      params.mimeType = mimeType;
    }

    const result = await firefox.sendBiDiCommand('browsingContext.startScreencast', params);

    activeRecordings.set(result.screencast, { path: result.path, context: contextId });

    return successResponse(
      `Screencast started (id: ${result.screencast}). Recording to: ${result.path}`
    );
  }
);

// ============================================================================
// Tool: screencast_stop
// ============================================================================

export const screencastStopTool = {
  name: 'screencast_stop',
  description:
    'Stop an in-progress screencast recording started with screencast_start and finalize the video file. Returns the path to the saved file.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      screencast: {
        type: 'string',
        description:
          'Id of the screencast to stop, as returned by screencast_start. Optional when exactly one recording is active.',
      },
    },
  },
} satisfies ToolDefinition;

export const handleScreencastStop = defineToolHandler(
  async (args: unknown): Promise<McpToolResponse> => {
    const { screencast } = (args ?? {}) as { screencast?: string };

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkScreencastSupported(firefox);

    let screencastId = screencast;
    if (screencastId === undefined) {
      if (activeRecordings.size === 1) {
        screencastId = activeRecordings.keys().next().value;
      } else if (activeRecordings.size === 0) {
        throw new Error('No active screencast recording to stop');
      } else {
        throw new Error(
          `Multiple screencast recordings are active. Specify which to stop: ${Array.from(activeRecordings.keys()).join(', ')}`
        );
      }
    }

    const result = await firefox.sendBiDiCommand('browsingContext.stopScreencast', {
      screencast: screencastId!,
    });

    activeRecordings.delete(screencastId as string);

    if (result.error) {
      return errorResponse(
        new Error(`Screencast saved to: ${result.path}, but an error occurred: ${result.error}`)
      );
    }

    return successResponse(`Screencast saved to: ${result.path}`);
  }
);

export const module = defineModule({
  name: 'screencast',
  description: 'Record screencasts of the page viewport (Firefox 154+).',
  tools: [
    [screencastStartTool, handleScreencastStart],
    [screencastStopTool, handleScreencastStop],
  ],
});

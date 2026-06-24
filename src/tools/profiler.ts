import { successResponse, errorResponse } from '../utils/response-helpers.js';
import { compareVersions } from '../utils/version.js';
import type { FirefoxDevTools } from '../firefox/index.js';
import type { McpToolResponse } from '../types/common.js';

const MIN_FIREFOX_VERSION = '154.0';

function checkProfilerSupported(firefox: FirefoxDevTools): void {
  const version = firefox.getFirefoxVersion();
  if (version !== null && compareVersions(version, MIN_FIREFOX_VERSION) < 0) {
    throw new Error(
      `moz:profiler requires Firefox ${MIN_FIREFOX_VERSION.split('.')[0]} or later (connected: ${version})`
    );
  }
}

const VALID_PRESETS = [
  'web-developer',
  'firefox-platform',
  'graphics',
  'media',
  'ml',
  'networking',
  'power',
  'debug',
];

// ============================================================================
// Tool: profiler_is_active
// ============================================================================

export const profilerIsActiveTool = {
  name: 'profiler_is_active',
  description: 'Check whether the Firefox profiler is currently recording.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleProfilerIsActive(_args: unknown): Promise<McpToolResponse> {
  try {
    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkProfilerSupported(firefox);

    const result = await firefox.sendBiDiCommand('moz:profiler.isActive', {});

    return successResponse(`Profiler is ${result.active ? 'active' : 'inactive'}`);
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: profiler_start
// ============================================================================

export const profilerStartTool = {
  name: 'profiler_start',
  description: `Start the Firefox profiler. Provide either a preset name or explicit recording options (entries, interval, features, threads). Cannot combine both. Valid presets: ${VALID_PRESETS.join(', ')}.`,
  inputSchema: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: VALID_PRESETS,
        description:
          'Profiler preset name. Cannot be combined with entries, interval, features, or threads.',
      },
      entries: {
        type: 'integer',
        description:
          'Number of entries to keep in the sampling buffer. Required when no preset is given.',
      },
      interval: {
        type: 'number',
        description: 'Sampling interval in milliseconds. Required when no preset is given.',
      },
      features: {
        type: 'array',
        items: { type: 'string' },
        description: 'Profiler features to enable. Required when no preset is given.',
      },
      threads: {
        type: 'array',
        items: { type: 'string' },
        description: 'Thread names to profile. Required when no preset is given.',
      },
      activeContext: {
        type: 'string',
        description:
          'Id of the top-level navigable to mark as the active tab in the profile. Does not restrict profiling to that tab.',
      },
    },
  },
};

export async function handleProfilerStart(args: unknown): Promise<McpToolResponse> {
  try {
    const { preset, entries, interval, features, threads, activeContext } = args as {
      preset?: string;
      entries?: number;
      interval?: number;
      features?: string[];
      threads?: string[];
      activeContext?: string;
    };

    const params: Record<string, unknown> = {};

    if (preset !== undefined) {
      params.preset = preset;
    } else {
      if (
        entries === undefined ||
        interval === undefined ||
        features === undefined ||
        threads === undefined
      ) {
        throw new Error(
          'When no preset is given, entries, interval, features, and threads are all required.'
        );
      }
      params.entries = entries;
      params.interval = interval;
      params.features = features;
      params.threads = threads;
    }

    if (activeContext !== undefined) {
      params.activeContext = activeContext;
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkProfilerSupported(firefox);

    await firefox.sendBiDiCommand('moz:profiler.start', params);

    return successResponse('Profiler started');
  } catch (error) {
    return errorResponse(error as Error);
  }
}

// ============================================================================
// Tool: profiler_stop
// ============================================================================

export const profilerStopTool = {
  name: 'profiler_stop',
  description:
    'Stop the Firefox profiler and save the recorded profile to a file in the downloads directory. Returns the path to the saved file, or null when nothing was saved.',
  inputSchema: {
    type: 'object',
    properties: {
      discard: {
        type: 'boolean',
        description:
          'If true, stop the profiler and discard the recording instead of saving it to disk. Defaults to false.',
      },
    },
  },
};

export async function handleProfilerStop(args: unknown): Promise<McpToolResponse> {
  try {
    const { discard } = args as { discard?: boolean };

    const params: Record<string, unknown> = {};
    if (discard !== undefined) {
      params.discard = discard;
    }

    const { getFirefox } = await import('../index.js');
    const firefox = await getFirefox();
    checkProfilerSupported(firefox);

    const result = await firefox.sendBiDiCommand('moz:profiler.stop', params);

    if (result.path) {
      return successResponse(`Profile saved to: ${result.path}`);
    }
    return successResponse('Profiler stopped. No profile was saved.');
  } catch (error) {
    return errorResponse(error as Error);
  }
}

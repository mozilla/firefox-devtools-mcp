import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleListExtensions, listExtensionsTool } from '../../src/tools/webextension.js';

const mockGetFirefox = vi.hoisted(() => vi.fn());
const mockSendBiDiCommand = vi.hoisted(() => vi.fn());

vi.mock('../../src/index.js', () => ({
  getFirefox: () => mockGetFirefox(),
}));

const extensions = [
  {
    id: 'enabled@example.com',
    name: 'Enabled Extension',
    version: '1.0.0',
    manifestVersion: 3,
    isActive: true,
    isSystem: false,
    hidden: false,
    temporarilyInstalled: false,
    policy: {
      uuid: 'enabled-uuid',
      baseURL: 'moz-extension://enabled-uuid/',
      extensionURL: 'moz-extension://enabled-uuid/index.html',
      backgroundScripts: ['background.js'],
    },
  },
  {
    id: 'disabled-system@example.com',
    name: 'Disabled System Extension',
    version: '2.3.4',
    manifestVersion: 2,
    isActive: false,
    isSystem: true,
    hidden: true,
    temporarilyInstalled: false,
    policy: {
      uuid: 'system-uuid',
      baseURL: 'moz-extension://system-uuid/',
      extensionURL: 'moz-extension://system-uuid/index.html',
      backgroundScripts: ['chrome/background.js', 'background.js'],
    },
  },
];

describe('list_extensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendBiDiCommand.mockResolvedValue({ extensions });
    mockGetFirefox.mockResolvedValue({ sendBiDiCommand: mockSendBiDiCommand });
  });

  it('describes the native BiDi command and does not require system access', () => {
    expect(listExtensionsTool.name).toBe('list_extensions');
    expect(listExtensionsTool.description).toContain('webExtension.moz:listExtensions');
    expect(listExtensionsTool.description).not.toContain('MOZ_REMOTE_ALLOW_SYSTEM_ACCESS');
  });

  it('lists extensions by default', async () => {
    const result = await handleListExtensions(undefined);

    expect(mockSendBiDiCommand).toHaveBeenCalledWith('webExtension.moz:listExtensions', {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('2 extension(s)');
    expect(result.content[0].text).toContain('enabled-uuid');
    expect(result.content[0].text).toContain('moz-extension://system-uuid/');
    expect(result.content[0].text).toContain('background.js');
    expect(result.content[0].text).toContain('Manifest: v3');
  });

  it('filters by exact IDs', async () => {
    const result = await handleListExtensions({ ids: ['disabled-system@example.com'] });

    expect(result.content[0].text).toContain('1 extension(s)');
    expect(result.content[0].text).toContain('Disabled System Extension');
    expect(result.content[0].text).not.toContain('Enabled Extension');
  });

  it('filters by case-insensitive partial name', async () => {
    const result = await handleListExtensions({ name: 'ENABLED' });

    expect(result.content[0].text).toContain('Enabled Extension');
    expect(result.content[0].text).not.toContain('Disabled System Extension');
  });

  it('filters by active status', async () => {
    const result = await handleListExtensions({ isActive: false });

    expect(result.content[0].text).toContain('Disabled System Extension');
    expect(result.content[0].text).not.toContain('Enabled Extension');
  });

  it('filters by system status', async () => {
    const result = await handleListExtensions({ isSystem: false });

    expect(result.content[0].text).toContain('Enabled Extension');
    expect(result.content[0].text).not.toContain('Disabled System Extension');
  });

  it('applies combined filters', async () => {
    const result = await handleListExtensions({
      ids: ['enabled@example.com', 'disabled-system@example.com'],
      name: 'system',
      isActive: false,
      isSystem: true,
    });

    expect(result.content[0].text).toContain('1 extension(s)');
    expect(result.content[0].text).toContain('(filtered by:');
    expect(result.content[0].text).toContain('Disabled System Extension');
  });

  it('reports filtered empty results', async () => {
    const result = await handleListExtensions({ name: 'missing' });

    expect(result.content[0].text).toBe('Extension not found: name: "missing"');
  });

  it('reports no extensions when the command returns none', async () => {
    mockSendBiDiCommand.mockResolvedValue({ extensions: [] });
    const result = await handleListExtensions(undefined);

    expect(result.content[0].text).toBe('No extensions installed');
  });

  it('does not silently turn command failures into an empty list', async () => {
    mockSendBiDiCommand.mockRejectedValue(
      new Error('BiDi error: unknown command webExtension.moz:listExtensions')
    );
    const result = await handleListExtensions(undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unknown command');
  });

  it('handles missing policy data explicitly', async () => {
    mockSendBiDiCommand.mockResolvedValue({
      extensions: [
        {
          ...extensions[0],
          policy: null,
        },
      ],
    });
    const result = await handleListExtensions(undefined);

    expect(result.content[0].text).toContain('UUID: unavailable');
    expect(result.content[0].text).toContain('Base URL: unavailable');
    expect(result.content[0].text).toContain('Background scripts: (none)');
  });
});

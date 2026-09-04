import type { Network } from 'webdriver-bidi-protocol';
import type { BiDiFacade } from './bidi';

/**
 * WebDriver BiDi network.CacheBehavior.
 * - "default": normal HTTP cache behaviour
 * - "bypass": skip the cache, so every request goes to the network
 */
export type CacheBehavior = Network.SetCacheBehaviorParameters['cacheBehavior'];

export const CACHE_BEHAVIORS: CacheBehavior[] = ['default', 'bypass'] as const;

export function isCacheBehavior(value: unknown): value is CacheBehavior {
  return CACHE_BEHAVIORS.includes(value as CacheBehavior);
}

export class CacheManagement {
  constructor(
    private getCurrentContextId: () => string | null,
    private sendBiDiCommand: BiDiFacade['sendCommand']
  ) {}

  async setCacheBehavior(behavior: CacheBehavior, options?: { global?: boolean }): Promise<void> {
    const params: Network.SetCacheBehaviorParameters = { cacheBehavior: behavior };

    // Omitting `contexts` applies the behaviour globally; passing the current
    // context scopes it to the selected tab, which is the default.
    if (!options?.global) {
      const contextId = this.getCurrentContextId();
      if (!contextId) {
        throw new Error('Cannot set cache behavior: no browsing context ID');
      }
      params.contexts = [contextId];
    }

    await this.sendBiDiCommand('network.setCacheBehavior', params);
  }
}

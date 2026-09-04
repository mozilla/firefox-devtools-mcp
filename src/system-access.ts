import type { FirefoxLaunchOptions } from './firefox/types.js';

export const SYSTEM_ACCESS_ENV = 'MOZ_REMOTE_ALLOW_SYSTEM_ACCESS';

export function isSystemAccessEnvironmentVariable(name: string): boolean {
  return name.toUpperCase() === SYSTEM_ACCESS_ENV;
}

export function applySystemAccessPolicy(
  options: FirefoxLaunchOptions,
  allowSystemAccess: boolean
): FirefoxLaunchOptions {
  const env = Object.fromEntries(
    Object.entries(options.env ?? {}).filter(([name]) => !isSystemAccessEnvironmentVariable(name))
  );

  if (allowSystemAccess) {
    env[SYSTEM_ACCESS_ENV] = '1';
  }

  return {
    ...options,
    env: Object.keys(env).length > 0 ? env : undefined,
  };
}

export function clearSystemAccessEnvironment(
  environment: Record<string, string | undefined>
): void {
  for (const name of Object.keys(environment)) {
    if (isSystemAccessEnvironmentVariable(name)) {
      delete environment[name];
    }
  }
}

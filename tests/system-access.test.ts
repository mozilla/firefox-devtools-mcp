import { describe, expect, it } from 'vitest';
import {
  applySystemAccessPolicy,
  clearSystemAccessEnvironment,
  SYSTEM_ACCESS_ENV,
} from '../src/system-access.js';

describe('system access policy', () => {
  it('removes requested system access without consent', () => {
    const options = {
      env: {
        MOZ_LOG: 'RemoteAgent:5',
        [SYSTEM_ACCESS_ENV]: '1',
      },
    };

    expect(applySystemAccessPolicy(options, false)).toEqual({
      env: { MOZ_LOG: 'RemoteAgent:5' },
    });
    expect(options.env[SYSTEM_ACCESS_ENV]).toBe('1');
  });

  it('forces the canonical system access value with consent', () => {
    const options = {
      env: {
        moz_remote_allow_system_access: '0',
        MOZ_LOG: 'RemoteAgent:5',
      },
    };

    expect(applySystemAccessPolicy(options, true)).toEqual({
      env: {
        MOZ_LOG: 'RemoteAgent:5',
        [SYSTEM_ACCESS_ENV]: '1',
      },
    });
  });

  it('keeps an empty environment undefined without consent', () => {
    expect(applySystemAccessPolicy({}, false)).toEqual({ env: undefined });
    expect(applySystemAccessPolicy({ env: { [SYSTEM_ACCESS_ENV]: '1' } }, false)).toEqual({
      env: undefined,
    });
  });

  it('removes inherited system access without changing unrelated variables', () => {
    const environment: Record<string, string | undefined> = {
      PATH: '/bin',
      Moz_Remote_Allow_System_Access: '1',
    };

    clearSystemAccessEnvironment(environment);

    expect(environment).toEqual({ PATH: '/bin' });
  });
});

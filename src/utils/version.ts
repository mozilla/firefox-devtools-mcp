/**
 * Firefox version number helpers.
 */

function getMajorVersion(version: string): number {
  const [major, _rhs] = version.split('.');
  if (!major) {
    throw new Error(`Unable to parse Firefox version ${version}`);
  }
  return Number.parseInt(major, 10);
}

/**
 * Simplified Firefox version comparison helper, only concerned with major
 * version checks.
 */
export function compareVersions(versionA: string, versionB: string): number {
  const majorA = getMajorVersion(versionA);
  const majorB = getMajorVersion(versionB);

  if (majorA < majorB) {
    return -1;
  }
  if (majorA > majorB) {
    return 1;
  }
  return 0;
}

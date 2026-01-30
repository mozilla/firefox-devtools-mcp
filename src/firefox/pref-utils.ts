/**
 * Firefox preference utilities
 * Helper functions for working with Services.prefs API
 */

/**
 * Generate a Services.prefs.set*Pref script for a given preference name and value
 * Uses setBoolPref for booleans, setIntPref for numbers, setStringPref for strings
 */
export function generatePrefScript(name: string, value: string | number | boolean): string {
  // Escape quotes in the name
  const escapedName = JSON.stringify(name);

  if (typeof value === 'boolean') {
    return `Services.prefs.setBoolPref(${escapedName}, ${value})`;
  } else if (typeof value === 'number') {
    return `Services.prefs.setIntPref(${escapedName}, ${value})`;
  } else {
    // String value - JSON.stringify handles escaping
    return `Services.prefs.setStringPref(${escapedName}, ${JSON.stringify(value)})`;
  }
}

const MAX_FUNCTION_SIZE = 16 * 1024; // 16 KB

/**
 * Validates that a string is a function or arrow function declaration suitable
 * for use with WebDriver BiDi script.callFunction.
 * Throws with a descriptive error if validation fails.
 */
export function validateFunction(fnString: string): void {
  if (!fnString || typeof fnString !== 'string') {
    throw new Error('function parameter is required and must be a string');
  }

  if (fnString.length > MAX_FUNCTION_SIZE) {
    throw new Error(
      `Function too large (${fnString.length} bytes, max ${MAX_FUNCTION_SIZE} bytes). ` +
        'This tool is not designed for massive scripts.'
    );
  }

  const trimmed = fnString.trim();
  const isFunctionLike =
    trimmed.startsWith('function') ||
    trimmed.startsWith('async function') ||
    trimmed.startsWith('(') ||
    trimmed.startsWith('async (');

  if (!isFunctionLike) {
    throw new Error(
      `Invalid function format. Expected a function or arrow function, got: "${trimmed.substring(0, 50)}...".\n\n` +
        'Valid examples:\n' +
        '  () => document.title\n' +
        '  async () => { return await fetch("/api") }\n' +
        '  (el) => el.innerText\n' +
        '  function() { return window.location.href }'
    );
  }
}

/**
 * Detects if the input looks like a JavaScript statement rather than an expression.
 * Statements like const/let/var declarations cannot be used in expression contexts.
 */
export function isLikelyStatement(input: string): boolean {
  const trimmed = input.trim();
  return /^(const|let|var)\s/.test(trimmed);
}

/**
 * Detects if the input looks like a function body (starts with "return").
 * Function bodies are valid in WebDriver Classic executeScript but not in BiDi script.evaluate,
 * which expects an expression.
 */
export function isLikelyFunctionBody(input: string): boolean {
  const trimmed = input.trim();
  return /^return(\s|;|$)/.test(trimmed);
}

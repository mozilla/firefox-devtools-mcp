/**
 * Guards docs/tools.md against drift from the tool registry.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToolsDoc, DOC_PATH } from '../../../scripts/generate-tools-doc.js';

describe('docs/tools.md', () => {
  it('matches the generated output', () => {
    const current = readFileSync(DOC_PATH, 'utf8');
    expect(current, 'docs/tools.md is out of date. Run: npm run docs:tools').toBe(renderToolsDoc());
  });
});

import { PACKAGE_NAME as CORE } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@diet/test-fixtures', () => {
  it('loads and resolves @diet/core through the workspace', () => {
    expect(PACKAGE_NAME).toBe('@diet/test-fixtures');
    expect(CORE).toBe('@diet/core');
  });
});

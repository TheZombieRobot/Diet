import { PACKAGE_NAME as CORE } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@diet/grocery', () => {
  it('loads and resolves @diet/core through the workspace', () => {
    expect(PACKAGE_NAME).toBe('@diet/grocery');
    expect(CORE).toBe('@diet/core');
  });
});

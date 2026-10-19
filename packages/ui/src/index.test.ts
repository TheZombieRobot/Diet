import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@diet/ui', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@diet/ui');
  });
});

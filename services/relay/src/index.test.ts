import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@diet/relay', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@diet/relay');
  });
});

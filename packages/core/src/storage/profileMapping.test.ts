import { describe, expect, it } from 'vitest';
import { estimateSexOf, guidanceSetFor } from './profileMapping';

describe('profile mapping (section 4.4; C24 point 4, C25, C46; section 16 test 8)', () => {
  it('a missing sex uses the midpoint constant for the energy estimate and the women’s guidance figures', () => {
    expect(estimateSexOf(null)).toBe('unspecified');
    expect(guidanceSetFor(null, null)).toBe('nz-women');
    expect(estimateSexOf('female')).toBe('female');
    expect(estimateSexOf('male')).toBe('male');
  });

  it('the stricter of the setting and the profile sex applies', () => {
    expect(guidanceSetFor('female', 'nz-men')).toBe('nz-women');
    expect(guidanceSetFor('male', 'nz-women')).toBe('nz-women');
    expect(guidanceSetFor('male', null)).toBe('nz-men');
    expect(guidanceSetFor('male', 'nz-men')).toBe('nz-men');
    expect(guidanceSetFor(null, 'nz-men')).toBe('nz-women');
  });
});

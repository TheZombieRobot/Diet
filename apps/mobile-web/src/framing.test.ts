import { describe, expect, it } from 'vitest';
import { FRAMED_MESSAGE, isFramed, refuseToRunFramed } from './framing';

describe('refusing to run inside a frame', () => {
  it('runs as itself at its own address', () => {
    expect(isFramed()).toBe(false);
    const self = {};
    expect(isFramed({ top: self, self })).toBe(false);
  });

  it('counts a different top window, or one the browser hides, as framed', () => {
    expect(isFramed({ top: {}, self: {} })).toBe(true);
    const hidden = {
      self: {},
      get top(): unknown {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    };
    expect(isFramed(hidden)).toBe(true);
  });

  it('shows only the plain message, with no links or buttons', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a href="#/today">Today</a><button>Install app</button>';
    refuseToRunFramed(root);
    expect(root.textContent).toBe(FRAMED_MESSAGE);
    expect(root.querySelectorAll('a, button, input')).toHaveLength(0);
    expect(FRAMED_MESSAGE).toBe('Open this app directly at its own address.');
  });
});

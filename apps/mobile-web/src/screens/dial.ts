/** A tap-to-call (or text) address for a number written with spaces. */
export const dial = (scheme: 'tel' | 'sms', number: string): string =>
  `${scheme}:${number.replace(/\s/g, '')}`;

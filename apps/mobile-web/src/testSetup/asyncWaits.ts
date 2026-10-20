import { configure } from '@testing-library/react';

// findBy* and waitFor give up after 1 s by default. Several builds share this machine's CPUs, and
// under that load a screen that does appear can take longer, so the wait is 5 s. Assertions that
// something never appears are unaffected: they use queryBy* and pass or fail at once.
configure({ asyncUtilTimeout: 5_000 });

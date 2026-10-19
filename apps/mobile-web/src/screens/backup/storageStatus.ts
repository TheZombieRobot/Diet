import { privacy } from '@diet/core/copy/health';
import type { StorageProtection } from '../../pwa/storage';

/** The status line on the Backup and data card and on About (storage spec section 12.1; C98). */
export function storageStatusText(status: StorageProtection): string {
  switch (status) {
    case 'protected':
      return privacy.storageStatus.protected;
    case 'not-protected':
      return privacy.storageStatus.notProtected;
    case 'unsupported':
      return privacy.storageStatus.unsupported;
    case 'checking':
      return privacy.storageStatus.checking;
  }
}

/**
 * @diet/grocery/transfer: pairing, sealing and the transfer payloads shared by the phone (items 30
 * and 31) and the laptop side panel (item 33), which imports only this, @diet/core/relay and the
 * copy (DOC_REVIEW C82). Framework-free; nothing here reads storage or the network. The exact
 * runtime export list is pinned by a test (the item-30/31 transfer contract, section 3.3).
 * deflateRaw and inflateRaw stay inside envelope.ts, and crc32 inside pasteCode.ts.
 */
export { base64UrlToBytes, bytesToBase64Url } from './base64url';
export {
  createPairingMaterial,
  formatPairingCode,
  NO_RELAY_URL,
  PAIRING_CHECK_LETTERS,
  PAIRING_CODE_PREFIX,
  PAIRING_CODE_VERSION,
  type PairingCode,
  type PairingCodeResult,
  pairingCheck,
  pairingCheckOfBits,
  type PairingMaterial,
  type PairingRelayStatus,
  pairingRelayStatus,
  parsePairingCode,
  storedRelayUrl,
} from './pairingCode';
export { importPairingKey, type PairingKey } from './pairingKey';
export {
  MAX_TRANSFER_PLAINTEXT_BYTES,
  type OpenBodyResult,
  type OpenFailure,
  openFromRelay,
  openRelayBody,
  type SealedRelayBody,
  sealForRelay,
  TRANSFER_AAD_LABEL,
  TRANSFER_FORMAT_VERSION,
  TRANSFER_IV_BYTES,
  transferAdditionalData,
} from './envelope';
export {
  ACK_PAYLOAD_KIND,
  type AckPayload,
  ackPayload,
  decodeAckPayload,
  decodeListPayload,
  encodeTransferPayload,
  LIST_PAYLOAD_KIND,
  type ListPayload,
  listPayload,
  monotonicSentAt,
  TRANSFER_ITEM_FIELDS,
  TRANSFER_PAYLOAD_VERSION,
  type TransferItem,
  type TransferList,
  transferListOf,
} from './payload';
export {
  ackFor,
  applyDecision,
  decideTransfer,
  type HeldList,
  type LaptopLineState,
  MAX_RECENT_TRANSFERS,
  parseRecentTransfers,
  pruneRecentTransfers,
  RECENT_TRANSFER_KEEP_MS,
  type RecentTransfer,
  recordAccepted,
  type TransferDecision,
  type TransferRef,
  type TransferSource,
  transferRefOf,
} from './duplicates';

// Item 31: the paste code, what a send and an acknowledgement change, when to listen and retry,
// and what the Send and export section shows.
export {
  bodyFromPasteCode,
  MAX_PASTE_CODE_CHARS,
  PASTE_CODE_CHECK_CHARS,
  PASTE_CODE_PREFIX,
  type PasteCodeProblem,
  type PasteCodeResult,
  pasteCodeFromBody,
} from './pasteCode';
export {
  type AckDecision,
  type AckRefusal,
  acknowledgementDecision,
  afterAcknowledgement,
  afterSend,
  type TransferFields,
} from './acknowledge';
export {
  ACK_POLL_FAST_MS,
  ACK_POLL_FAST_PERIOD_MS,
  ACK_POLL_MAX_WAIT_MS,
  ACK_POLL_SLOW_MS,
  ackPollDelayMs,
  ackWindowOpen,
  parseRetryAfterMs,
  POST_RETRY_MAX_MS,
  retryDelayMs,
} from './schedule';
export {
  type SendOutcome,
  sendOutcomeOf,
  type SendPlan,
  sendPlan,
  TRANSFER_EXTRA_IDS,
  TRANSFER_LINE_IDS,
  type TransferActions,
  transferActions,
  type TransferExtraId,
  type TransferLine,
  transferLine,
  type TransferLineId,
  type TransferLineInput,
  transferLineText,
  type TransferPairingState,
  transferPairingState,
  type TransferStatus,
  transferStatusNextChange,
  transferStatusOf,
} from './sendStatus';

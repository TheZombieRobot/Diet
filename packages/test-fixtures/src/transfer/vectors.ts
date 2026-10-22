/**
 * Fixed transfer vectors (checklist item 30 design 5.6; the item-30/31 transfer contract, section
 * 10.1): the pairing code, the sealed body layout, the list payload and the acknowledgement, pinned
 * byte for byte so the phone (items 30 and 31) and the laptop side panel (item 33) are proven to
 * agree. All synthetic: bytes counting up, relay.example.com, "Example store", instants in 2000.
 *
 * Plain constants typed with @diet/core types only, so nothing here depends on the code it pins.
 * The bodies were sealed with the fixed IVs below and opened independently with node:crypto and
 * zlib; nothing re-seals to compare bodies (a real seal draws a fresh IV). Item 31 adds V6.
 */
import type { GroceryListRecord } from '@diet/core';

const counting = (from: number, length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => from + i);

/** V0: AES-GCM test case 16 (McGrew and Viega, The Galois/Counter Mode of Operation; 256-bit key). */
export const GCM_CASE_16 = Object.freeze({
  keyHex: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
  ivHex: 'cafebabefacedbaddecaf888',
  additionalDataHex: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
  plaintextHex:
    'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
  ciphertextHex:
    '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662',
  tagHex: '76fc6ece0f4e1768cddf8853bb2d551b',
});

/** V1's key: bytes 0x00 to 0x1f. Every body below is sealed under it. */
export const VECTOR_KEY_BYTES: Uint8Array = counting(0x00, 32);
/** V1's room: bytes 00 11 22 … ff. */
export const V1_ROOM_ID = 'ABEiM0RVZneImaq7zN3u_w';
export const V1_KEY_TEXT = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const V1_RELAY = 'https://relay.example.com';
/** V1: a pairing code with a relay address (104 characters). */
export const V1_CODE = `diet-pair:1:${V1_ROOM_ID}:${V1_KEY_TEXT}:${V1_RELAY}`;
/** V1': the same with no relay address (79 characters). */
export const V1_CODE_NO_RELAY = `diet-pair:1:${V1_ROOM_ID}:${V1_KEY_TEXT}:`;
/** The pairing check of V1's room (SHA-256 starts a187). */
export const V1_CHECK = 'PCMK';

/** The IV of V2 and V3 (0xa0 to 0xab) and of V4 (0xb0 to 0xbb). */
export const VECTOR_IV_LIST: Uint8Array = counting(0xa0, 12);
export const VECTOR_IV_ACK: Uint8Array = counting(0xb0, 12);

/** V2: "Example plaintext" sealed in slot list (68 characters). */
export const V2_PLAINTEXT = 'Example plaintext';
export const V2_BODY = 'rl1.AaChoqOkpaanqKmqq5W1NOFoA0vqSq3OH8tRiXNYrVlFvfQCLJ6ZADTNSBP2kFCg';

const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/**
 * V3's source list, as stored: three lines, of which the second is already-have with an unknown
 * garden amount, and the first has a price, a garden amount and an audit note. None of those reach
 * the payload.
 */
export const V3_LIST: GroceryListRecord = {
  id: id(0x01),
  version: 3,
  createdAt: '2000-01-01T00:00:00.000Z',
  updatedAt: '2000-01-05T05:00:00.000Z',
  storeName: 'Example store',
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
  items: [
    {
      id: id(0x11),
      origin: 'generated',
      ingredientId: 'seed:example-ingredient-1',
      text: 'Example item 1',
      quantity: 500,
      unit: 'g',
      packSuggestion: '1 x 500 g pack',
      aisle: 'Produce',
      substituteHint: null,
      section: 'to-buy',
      fromGardenG: 300,
      gardenAmountUnknown: false,
      fromPantryG: null,
      auditNote: '300 g from garden',
      price: { amountNzCents: 650, basis: 'line', enteredAt: '2000-01-02T00:00:00.000Z' },
      ticked: false,
    },
    {
      id: id(0x13),
      origin: 'generated',
      ingredientId: 'seed:example-ingredient-2',
      text: 'Example item 3',
      quantity: 200,
      unit: 'g',
      packSuggestion: null,
      aisle: 'Produce',
      substituteHint: null,
      section: 'already-have',
      fromGardenG: null,
      gardenAmountUnknown: true,
      fromPantryG: null,
      auditNote: 'garden amount not entered',
      price: null,
      ticked: false,
    },
    {
      id: id(0x12),
      origin: 'manual',
      ingredientId: null,
      text: 'Example item 2',
      quantity: null,
      unit: null,
      packSuggestion: null,
      aisle: 'Other',
      substituteHint: 'Example substitute',
      section: 'to-buy',
      fromGardenG: null,
      gardenAmountUnknown: false,
      fromPantryG: null,
      auditNote: null,
      price: null,
      ticked: true,
    },
  ],
};

/** V3's send: the transfer id and the send time. */
export const V3_SEND = Object.freeze({ transferId: id(0x02), sentAt: '2000-01-05T06:00:00.000Z' });

/** V3: the list payload of V3_LIST and V3_SEND, exactly as encoded (594 characters). */
export const V3_JSON =
  '{"kind":"diet-list","v":1,"listId":"00000000-0000-4000-8000-000000000001","version":3,"transferId":"00000000-0000-4000-8000-000000000002","sentAt":"2000-01-05T06:00:00.000Z","list":{"storeName":"Example store","items":[{"id":"00000000-0000-4000-8000-000000000011","text":"Example item 1","quantity":500,"unit":"g","packSuggestion":"1 x 500 g pack","aisle":"Produce","substituteHint":null,"ticked":false},{"id":"00000000-0000-4000-8000-000000000012","text":"Example item 2","quantity":null,"unit":null,"packSuggestion":null,"aisle":"Other","substituteHint":"Example substitute","ticked":true}]}}';
export const V3_SHA256 = '3d5898a9adc1ab3bc54e63a534afbae4293da4608c5075d799ebbcaa6f46dc5a';
/** V3_JSON sealed in slot list (399 characters). */
export const V3_BODY =
  'rl1.AaChoqOkpaanqKmqq2uIPWKG-w46nS9yHR4Iy5tYm1dY4rZmVB02olNU-s5t9nhtVVX9AufSnWaadMphDiXgDTJWBk-u6XLA_BExJUC1Ia7L0oO9VH8nZ9bddBQtdsP4sz6hrnQUIX8mwPuI6uH7Ki7D4KGehB5uto6i8sF4QwgMzRfh_uvLA4d8kwHgnCKE0enxXqGr1OSfvrqrlrcuHZgIN3PSRV6iNn1XGMIpyScARGMdBKtOTPHayLy6xErj-l8VPs9bSsUXdwutbX8gWEVtvJlRBMZq4Vp_uhoTRaAJVIjcYih3DfXmqmLlNsgE0RmLWiiHfMkAotjS9neHPXoWhk1p9hEclWLF2EHIOcd3De-tz6VTUlKLjlocSjEUlOCX_GOKiBc';

/** V4: the acknowledgement of V3's send (177 characters). */
export const V4_JSON =
  '{"kind":"diet-ack","v":1,"listId":"00000000-0000-4000-8000-000000000001","version":3,"transferId":"00000000-0000-4000-8000-000000000002","receivedAt":"2000-01-05T06:01:00.000Z"}';
/** V4_JSON sealed in slot ack (187 characters). */
export const V4_BODY =
  'rl1.AbCxsrO0tba3uLm6uxTe4aEv_a8cuL0k_ympyXrf-6dLr6t3I3DHrCl6yRupAsxXleXd5IK6lzZoOGg2T1z39ndZuYGS6LS28ifl51oTF-uXq-X8UaTPRrLO9Xr7DWN2zK__2U4vUYnOCrH5_JMccOfHVKYxzAFm6wox1_Xkt99wDUoW0MzEuRA';

/** V5: a second pairing (Pair again, and the old key): room bytes 0x20–0x2f, key 0x40–0x5f, no relay. */
export const V5_ROOM_ID = 'ICEiIyQlJicoKSorLC0uLw';
export const V5_KEY_BYTES: Uint8Array = counting(0x40, 32);
export const V5_CHECK = 'TVST';
export const V5_CODE = `diet-pair:1:${V5_ROOM_ID}:QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8:`;

/** V6 (item 31; contract section 10.1): the paste code of V2 (77 characters). */
export const V6_PASTE_CODE =
  'dl1.AaChoqOkpaanqKmqq5W1NOFoA0vqSq3OH8tRiXNYrVlFvfQCLJ6ZADTNSBP2kFCg.af44727c';
/** The check of V3_BODY's paste code (408 characters in all). */
export const V3_PASTE_CHECK = 'c8faef6f';

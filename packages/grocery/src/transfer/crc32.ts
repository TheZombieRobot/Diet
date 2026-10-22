/**
 * CRC-32/ISO-HDLC (reflected, polynomial 0xEDB88320, initial and final XOR 0xFFFFFFFF), the check
 * at the end of a paste code (item 31 design 2.5; contract section 8). Not a security check: the
 * sealed body's tag is. It only lets a cut or changed code be named in plain words. Not exported
 * from the transfer index; tests import this file.
 */
const TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The unsigned CRC-32 of `bytes`. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

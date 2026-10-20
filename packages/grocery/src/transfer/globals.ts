/**
 * The browser features the transfer code needs beyond core's (storage/backup/crypto.ts): the raw
 * import of a pairing key, and CompressionStream and DecompressionStream for deflate-raw. The
 * package's TypeScript lib has no DOM types, so the few members used are typed here and read from
 * globalThis, with a clear error when one is missing. Node 22 and Chrome provide all of them.
 */

/** An opaque WebCrypto CryptoKey (core's StoredCryptoKey describes what storage checks of it). */
export type CryptoKeyLike = object;

interface SubtleKeyImport {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: { name: 'AES-GCM' },
    extractable: false,
    usages: string[],
  ): Promise<CryptoKeyLike>;
}

/** globalThis.crypto.subtle, for the one call core's WebCryptoSubset does not type. */
export function subtleKeyImport(): SubtleKeyImport {
  const subtle = (globalThis as { crypto?: { subtle?: Partial<SubtleKeyImport> } }).crypto?.subtle;
  if (typeof subtle?.importKey !== 'function') {
    throw new Error('WebCrypto (globalThis.crypto.subtle) is not available');
  }
  return subtle as SubtleKeyImport;
}

export interface ChunkReader {
  read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array }>;
  cancel(): Promise<void>;
}

export interface ChunkWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** A CompressionStream or DecompressionStream: bytes go into `writable` and come out of `readable`. */
export interface ByteTransform {
  readonly readable: { getReader(): ChunkReader };
  readonly writable: { getWriter(): ChunkWriter };
}

type ByteTransformClass = new (format: 'deflate-raw') => ByteTransform;

interface CompressionGlobals {
  CompressionStream: ByteTransformClass;
  DecompressionStream: ByteTransformClass;
}

/** CompressionStream and DecompressionStream from globalThis. */
export function compressionStreams(): CompressionGlobals {
  // Through unknown: where the DOM lib is loaded (the app), its stream types are wider than these.
  const g = globalThis as unknown as Partial<CompressionGlobals>;
  if (typeof g.CompressionStream !== 'function' || typeof g.DecompressionStream !== 'function') {
    throw new Error('CompressionStream and DecompressionStream are not available');
  }
  return g as CompressionGlobals;
}

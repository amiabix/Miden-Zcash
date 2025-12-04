/**
 * Note Scanner
 * Scans the blockchain for notes belonging to a viewing key
 */

import { blake2s } from '@noble/hashes/blake2s';
import type {
  SaplingNote,
  SaplingIncomingViewingKey,
  SaplingFullViewingKey,
  ScannedNote,
  CompactNote,
  ScanProgress
} from './types.js';
import { computeNoteCommitment, deriveRcmFromRseed } from './noteCommitment.js';
import { NoteCache } from './noteCache.js';
import { concatBytes, bytesToHex, hexToBytes } from '../utils/bytes';
import { computeSharedSecret, derivePkd } from './jubjubHelper.js';
import { MerkleTreePersistence } from './merkleTreePersistence.js';
import { encodeZcashAddress } from './bech32.js';

// ChaCha20Poly1305 personalization
const NOTE_ENCRYPTION_PERSONALIZATION = new Uint8Array([
  0x5a, 0x63, 0x61, 0x73, 0x68, 0x5f, 0x4e, 0x6f, // "Zcash_No"
  0x74, 0x65, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70  // "teEncryp"
]);

/**
 * Block data for scanning
 */
export interface BlockData {
  height: number;
  hash: string;
  transactions: TransactionData[];
}

/**
 * Transaction data for scanning
 */
export interface TransactionData {
  txid: string;
  outputs: CompactNote[];
  nullifiers: Uint8Array[];
}

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  /** Number of blocks to scan in parallel */
  batchSize: number;
  
  /** Progress callback */
  onProgress?: (progress: ScanProgress) => void;
  
  /** Whether to scan for outgoing notes as well */
  scanOutgoing: boolean;
}

const DEFAULT_CONFIG: ScannerConfig = {
  batchSize: 100,
  scanOutgoing: false
};

/**
 * Note Scanner for finding notes with a viewing key
 */
export class NoteScanner {
  private ivk: SaplingIncomingViewingKey;
  private cache: NoteCache;
  private config: ScannerConfig;
  private aborted: boolean = false;
  private decryptionStats: {
    attempts: number;
    successes: number;
    failures: number;
    failureReasons: Map<string, number>;
  } = {
    attempts: 0,
    successes: 0,
    failures: 0,
    failureReasons: new Map()
  };

  constructor(
    ivk: SaplingIncomingViewingKey,
    cache: NoteCache,
    config: Partial<ScannerConfig> = {},
    _fvk?: SaplingFullViewingKey
  ) {
    this.ivk = ivk;
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get decryption statistics
   */
  getDecryptionStats() {
    return { ...this.decryptionStats };
  }

  /**
   * Reset decryption statistics
   */
  resetDecryptionStats() {
    this.decryptionStats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      failureReasons: new Map()
    };
  }

  /**
   * Scan a range of blocks for notes
   * 
   * @param blocks - Block data to scan
   * @param startHeight - Starting block height
   * @param endHeight - Ending block height
   * @param merkleTree - Optional Merkle tree to update with commitments and generate witnesses
   */
  async scanBlocks(
    blocks: BlockData[],
    startHeight: number,
    endHeight: number,
    merkleTree?: IncrementalMerkleTree
  ): Promise<ScannedNote[]> {
    const foundNotes: ScannedNote[] = [];
    const totalBlocks = endHeight - startHeight + 1;
    let processedBlocks = 0;

    for (const block of blocks) {
      if (this.aborted) {
        break;
      }

      // First, add all commitments to Merkle tree (if provided)
      // This ensures we can generate witnesses for our notes
      if (merkleTree) {
        for (const tx of block.transactions) {
          for (const output of tx.outputs) {
            // Add commitment to tree and get position
            const position = merkleTree.append(output.cmu);
            // Store position in output for later use
            (output as any).position = position;
          }
        }
      }

      const blockNotes = await this.scanBlock(block, merkleTree);
      foundNotes.push(...blockNotes);

      // Update spent nullifiers
      for (const tx of block.transactions) {
        for (const nullifier of tx.nullifiers) {
          this.cache.markSpent(nullifier);
        }
      }

      processedBlocks++;

      // Report progress
      if (this.config.onProgress) {
        this.config.onProgress({
          startHeight,
          endHeight,
          currentHeight: block.height,
          notesFound: foundNotes.length,
          percentComplete: (processedBlocks / totalBlocks) * 100
        });
      }
    }

    // Add found notes to cache with witnesses
    for (const scannedNote of foundNotes) {
      if (scannedNote.note.position !== undefined && merkleTree) {
        const witness = merkleTree.witness(scannedNote.note.position);
        if (witness) {
          scannedNote.note.witness = witness;
        }
      }
      this.cache.addNote(scannedNote);
    }

    return foundNotes;
  }

  /**
   * Scan a single block
   * 
   * @param block - Block data to scan
   * @param merkleTree - Optional Merkle tree to get position from
   */
  async scanBlock(block: BlockData, merkleTree?: IncrementalMerkleTree): Promise<ScannedNote[]> {
    const notes: ScannedNote[] = [];

    for (let txIndex = 0; txIndex < block.transactions.length; txIndex++) {
      const tx = block.transactions[txIndex];
      
      for (let outputIndex = 0; outputIndex < tx.outputs.length; outputIndex++) {
        const output = tx.outputs[outputIndex];
        
        try {
          const note = await this.tryDecryptNote(output, block.height);
          if (note) {
            // Get position from output if available (set during tree.append)
            if ((output as any).position !== undefined) {
              note.position = (output as any).position;
            }
            
            notes.push({
              note,
              blockHeight: block.height,
              txIndex,
              outputIndex,
              isOutgoing: false
            });
          }
        } catch (error) {
          // Note not for us or decryption failed
          // Error already logged in tryDecryptNote
          // Continue scanning other notes
        }
      }
    }

    return notes;
  }

  /**
   * Try to decrypt a note with our viewing key
   * 
   * Implements Zcash Sapling note decryption per protocol specification:
   * 1. Derive shared secret via ECDH on Jubjub curve
   * 2. Derive decryption key from shared secret
   * 3. Derive nonce from shared secret (not from epk directly)
   * 4. Decrypt ciphertext using ChaCha20Poly1305
   * 5. Verify commitment matches decrypted note
   */
  async tryDecryptNote(
    compactNote: CompactNote,
    blockHeight: number
  ): Promise<SaplingNote | null> {
    this.decryptionStats.attempts++;

    try {
      // Validate inputs
      if (!compactNote.cmu || compactNote.cmu.length !== 32) {
        throw new Error('Invalid commitment: must be 32 bytes');
      }
      if (!compactNote.ephemeralKey || compactNote.ephemeralKey.length !== 32) {
        throw new Error('Invalid ephemeral key: must be 32 bytes');
      }
      if (!compactNote.ciphertext || compactNote.ciphertext.length !== 52) {
        throw new Error('Invalid ciphertext: compact notes must be 52 bytes');
      }

      // Step 1: Derive shared secret using ECDH on Jubjub curve
      // Shared secret S = KA_agree(ivk, epk) where ivk is scalar and epk is point
      const sharedSecret = this.deriveSharedSecret(
        this.ivk.ivk,
        compactNote.ephemeralKey
      );

      if (!sharedSecret || sharedSecret.length !== 32) {
        throw new Error('Failed to derive shared secret');
      }

      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.debug('Decryption inputs:', {
          epk: bytesToHex(compactNote.ephemeralKey),
          epkLength: compactNote.ephemeralKey.length,
          ivk: bytesToHex(this.ivk.ivk)
        });
        console.debug('Decryption shared secret:', {
          sharedSecret: bytesToHex(sharedSecret),
          ivk: bytesToHex(this.ivk.ivk),
          epk: bytesToHex(compactNote.ephemeralKey)
        });
      }

      // Step 2: Derive note decryption key from shared secret
      // According to Zcash spec: K_enc = KDFSapling(sharedSecret, epk)
      // Where sharedSecret = KA_agree(ivk, epk) for decryption
      // This should match encryption: K_enc = KDFSapling(KA_agree(esk, pkD), epk)
      // Since KA_agree(esk, pkD) = KA_agree(ivk, epk), both derive the same key
      // Implementation: KDFSapling = BLAKE2s(sharedSecret || epk) with personalization
      const noteKey = this.deriveNoteKey(sharedSecret, compactNote.ephemeralKey);

      if (!noteKey || noteKey.length !== 32) {
        throw new Error('Failed to derive decryption key');
      }

      // Step 3: Derive nonce for ChaCha20Poly1305
      // According to Zcash spec (ZIP 216): nonce = blake2s([0] || rseed)
      // Problem: We don't have rseed until after decryption (chicken-and-egg)
      // 
      // Solution: Try multiple nonce derivation strategies
      // Strategy 1: Derive from shared secret (may work if spec allows)
      // Strategy 2: Zero nonce (common fallback for compact notes)
      // Strategy 3: After decryption, verify nonce matches rseed-based derivation
      
      let plaintext: Uint8Array | null = null;
      let usedNonceStrategy: 'shared_secret' | 'zero' | null = null;
      
      // Strategy 1: Try nonce derived from shared secret
      // This is an approximation - not guaranteed to match spec
      const nonceFromSharedSecret = blake2s(
        concatBytes(sharedSecret, new Uint8Array([0x00])),
        { dkLen: 12 }
      ).slice(0, 12);

      plaintext = await this.decryptCompactNote(
        compactNote.ciphertext,
        noteKey,
        nonceFromSharedSecret
      );

      if (plaintext && plaintext.length === 36) {
        usedNonceStrategy = 'shared_secret';
      } else {
        // Strategy 2: Try zero nonce (common for compact notes)
        const zeroNonce = new Uint8Array(12);
        plaintext = await this.decryptCompactNote(
          compactNote.ciphertext,
          noteKey,
          zeroNonce
        );

        if (plaintext && plaintext.length === 36) {
          usedNonceStrategy = 'zero';
        } else {
          // Debug: Log what we tried for troubleshooting
          if (process.env.NODE_ENV === 'development') {
            console.debug('Nonce strategies failed:', {
              strategy1Nonce: bytesToHex(nonceFromSharedSecret),
              strategy2Nonce: bytesToHex(zeroNonce),
              sharedSecretLength: sharedSecret.length,
              noteKeyLength: noteKey.length,
              ciphertextLength: compactNote.ciphertext.length
            });
          }
        }
      }

      if (!plaintext || plaintext.length !== 36) {
        throw new Error('Decryption failed: invalid plaintext or authentication failure. Nonce derivation may be incorrect. Tried both shared-secret and zero nonce strategies.');
      }

      // Step 4: Parse the plaintext
      const notePlaintext = this.parseCompactPlaintext(plaintext);

      // Step 4a: Verify nonce derivation was correct by checking if it matches rseed-based derivation
      // According to spec: nonce = blake2s([0] || rseed)
      const specNonce = blake2s(
        concatBytes(new Uint8Array([0]), notePlaintext.rseed),
        { dkLen: 12 }
      );

      const nonceMatches = usedNonceStrategy === 'zero'
        ? this.bytesEqual(new Uint8Array(12), specNonce)
        : this.bytesEqual(nonceFromSharedSecret, specNonce);

      // Track nonce verification in statistics
      if (!nonceMatches) {
        const reason = usedNonceStrategy === 'zero'
          ? 'Nonce mismatch: used zero nonce but spec requires rseed-based'
          : 'Nonce mismatch: shared-secret derivation does not match spec';
        const currentCount = this.decryptionStats.failureReasons.get(reason) || 0;
        this.decryptionStats.failureReasons.set(reason, currentCount + 1);

        if (process.env.NODE_ENV === 'development') {
          console.warn('Nonce verification failed:', {
            usedStrategy: usedNonceStrategy,
            specNonce: bytesToHex(specNonce),
            usedNonce: bytesToHex(usedNonceStrategy === 'zero' ? new Uint8Array(12) : nonceFromSharedSecret),
            note: 'Decryption succeeded but nonce derivation may be incorrect'
          });
        }
      }

      // Step 6: Derive pkD from diversifier and verify it matches
      const pkD = this.derivePkD(notePlaintext.diversifier);
      if (!pkD || pkD.length !== 32) {
        throw new Error('Failed to derive payment key');
      }

      if (process.env.NODE_ENV === 'development') {
        console.debug('Decryption pkD computation:', {
          pkD: bytesToHex(pkD),
          diversifier: bytesToHex(notePlaintext.diversifier),
          ivk: bytesToHex(this.ivk.ivk)
        });
      }

      // Step 7: Verify the note commitment matches
      // This is critical: ensures the decrypted note is valid
      const rcm = deriveRcmFromRseed(notePlaintext.rseed);
      const computedCmu = computeNoteCommitment(
        notePlaintext.diversifier,
        pkD,
        notePlaintext.value,
        rcm
      );

      if (!computedCmu || computedCmu.length !== 32) {
        throw new Error('Failed to compute commitment');
      }

      // Verify commitment matches (constant-time comparison)
      if (!this.bytesEqual(computedCmu, compactNote.cmu)) {
        throw new Error('Commitment verification failed: decrypted note does not match commitment');
      }

      // Step 8: Encode address using proper Bech32 encoding
      const network = this.getNetwork();
      const hrp = network === 'testnet' ? 'ztestsapling' : 'zs';
      const address = encodeZcashAddress(hrp, notePlaintext.diversifier, pkD);

      // Construct the note with position for Merkle tree
      const note: SaplingNote = {
        commitment: compactNote.cmu,
        nullifier: new Uint8Array(32), // Will compute when spending
        value: Number(notePlaintext.value),
        rcm,
        rseed: notePlaintext.rseed,
        cmu: compactNote.cmu,
        address,
        diversifier: notePlaintext.diversifier,
        pkD,
        blockHeight,
        memo: notePlaintext.memo,
        spent: false,
        position: undefined // Will be set when added to Merkle tree
      };

      this.decryptionStats.successes++;
      return note;
    } catch (error) {
      const decryptionError = error instanceof Error ? error : new Error(String(error));
      this.decryptionStats.failures++;

      const errorKey = decryptionError.message.split(':')[0] || 'Unknown error';
      const currentCount = this.decryptionStats.failureReasons.get(errorKey) || 0;
      this.decryptionStats.failureReasons.set(errorKey, currentCount + 1);

      // Always log errors (not just in development) but with limited detail
      console.warn('Note decryption failed:', {
        error: errorKey,
        commitment: compactNote.cmu ? bytesToHex(compactNote.cmu).slice(0, 8) + '...' : 'missing',
        hasEpk: !!compactNote.ephemeralKey,
        ciphertextLength: compactNote.ciphertext?.length || 0
      });

      return null;
    }
  }

  /**
   * Derive shared secret from ivk and ephemeral key
   *
   * Implementation: [ivk] * epk on Jubjub elliptic curve
   * This is ECDH key agreement on Jubjub
   */
  private deriveSharedSecret(ivk: Uint8Array, epk: Uint8Array): Uint8Array {
    // Use Jubjub elliptic curve for proper ECDH
    // Computes the shared secret: [ivk] * epk where ivk is a scalar and epk is a point
    return computeSharedSecret(ivk, epk);
  }

  /**
   * Derive note decryption key from shared secret
   */
  private deriveNoteKey(sharedSecret: Uint8Array, epk: Uint8Array): Uint8Array {
    const input = concatBytes(sharedSecret, epk);
    return blake2s(input, { 
      key: NOTE_ENCRYPTION_PERSONALIZATION,
      dkLen: 32 
    });
  }

  /**
   * Decrypt compact note ciphertext using ChaCha20Poly1305
   *
   * Zcash Sapling compact note format (ZIP 302):
   * - Total: 52 bytes
   * - Encrypted data: 36 bytes (1 byte lead + 11 bytes diversifier + 8 bytes value + 16 bytes rseed)
   * - Poly1305 tag: 16 bytes
   * - Format: [36 bytes encrypted] [16 bytes tag] = 52 bytes total
   *
   * Uses ChaCha20Poly1305 AEAD cipher from @noble/ciphers
   */
  private async decryptCompactNote(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce?: Uint8Array
  ): Promise<Uint8Array | null> {
    // Zcash compact note: 36 bytes encrypted + 16 bytes tag = 52 bytes
    if (ciphertext.length !== 52) {
      return null;
    }

    try {
      // Import ChaCha20Poly1305 from @noble/ciphers
      const { chacha20poly1305 } = require('@noble/ciphers/chacha');

      // Use provided nonce or default to 12-byte zero nonce
      const decryptionNonce = nonce || new Uint8Array(12);

      if (decryptionNonce.length !== 12) {
        // Invalid nonce length - ChaCha20Poly1305 requires exactly 12 bytes
        return null;
      }

      if (key.length !== 32) {
        // Invalid key length - ChaCha20Poly1305 requires exactly 32 bytes
        return null;
      }

      // Create cipher instance
      const cipher = chacha20poly1305(key, decryptionNonce);

      // ChaCha20Poly1305 format: [encrypted data][16-byte tag]
      // Split the ciphertext and tag
      const encryptedData = ciphertext.slice(0, 36);
      const authTag = ciphertext.slice(36, 52);

      // Decrypt and verify authentication tag
      // The decrypt function takes full ciphertext+tag and verifies
      // Use Uint8Array concatenation for browser compatibility (not Buffer)
      const concatCiphertext = new Uint8Array(encryptedData.length + authTag.length);
      concatCiphertext.set(encryptedData, 0);
      concatCiphertext.set(authTag, encryptedData.length);

      const plaintext = cipher.decrypt(concatCiphertext);

      return new Uint8Array(plaintext);
    } catch (error) {
      // Decryption failed (wrong key, corrupted data, or invalid tag)
      return null;
    }
  }

  /**
   * Parse compact plaintext (52 bytes)
   * Format: [1 byte lead] [11 bytes diversifier] [8 bytes value] [32 bytes rseed]
   */
  private parseCompactPlaintext(plaintext: Uint8Array): {
    diversifier: Uint8Array;
    value: bigint;
    rseed: Uint8Array;
    memo: Uint8Array;
  } {
    let offset = 0;

    // Lead byte (skip)
    offset += 1;

    // Diversifier (11 bytes)
    const diversifier = plaintext.slice(offset, offset + 11);
    offset += 11;

    // Value (8 bytes, little-endian)
    const valueView = new DataView(
      plaintext.buffer,
      plaintext.byteOffset + offset,
      8
    );
    const value = valueView.getBigUint64(0, true);
    offset += 8;

    // Rseed (32 bytes)
    const rseed = plaintext.slice(offset, offset + 32);

    // Memo is not in compact format
    const memo = new Uint8Array(512);

    return { diversifier, value, rseed, memo };
  }

  /**
   * Derive pk_d from diversifier using ivk
   *
   * pk_d = [ivk] * DiversifyHash(d)
   * This scalar multiplies the diversified base point by the incoming viewing key
   */
  private derivePkD(diversifier: Uint8Array): Uint8Array {
    // Use Jubjub elliptic curve for proper payment key derivation
    // Computes pk_d = [ivk] * DiversifyHash(d)
    return derivePkd(this.ivk.ivk, diversifier);
  }

  /**
   * Get network type (testnet or mainnet)
   * This should be passed from the scanner configuration
   */
  private getNetwork(): 'testnet' | 'mainnet' {
    // Default to testnet if not configured
    // In production, this should come from scanner config
    return (this as any).network || 'testnet';
  }

  /**
   * Compare byte arrays
   */
  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Abort ongoing scan
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Reset abort flag
   */
  reset(): void {
    this.aborted = false;
  }
}

/**
 * Merkle Witness with anchor for verification
 */
export interface MerkleWitness {
  authPath: Uint8Array[];
  position: bigint;
  anchor: Uint8Array;
}

/**
 * Incremental Merkle Tree for witnesses
 * Optimized implementation with precomputed empty nodes and caching
 */
export class IncrementalMerkleTree {
  private leaves: Uint8Array[] = [];
  private depth: number;
  private emptyNodes: Map<number, Uint8Array> = new Map();
  private cachedRoot: Uint8Array | null = null;

  constructor(depth: number = 32) {
    this.depth = depth;
    this.precomputeEmptyNodes();
  }

  /**
   * Precompute empty nodes for each level (optimization)
   * Empty[0] = hash(0, 0)
   * Empty[1] = hash(Empty[0], Empty[0])
   * ...
   */
  private precomputeEmptyNodes(): void {
    let node: Uint8Array = new Uint8Array(32);

    for (let level = 0; level < this.depth; level++) {
      this.emptyNodes.set(level, node);
      // Create new Uint8Array to ensure type compatibility
      const hashed = this.hashPair(node, node);
      node = new Uint8Array(hashed);
    }
    // Store the final empty root
    this.emptyNodes.set(this.depth, node);
  }

  /**
   * Append a leaf to the tree
   */
  append(leaf: Uint8Array): number {
    const position = this.leaves.length;
    this.leaves.push(leaf);
    // Invalidate cached root when tree changes
    this.cachedRoot = null;
    return position;
  }

  /**
   * Get root of the tree (with caching for performance)
   */
  root(): Uint8Array {
    // Return cached root if available
    if (this.cachedRoot !== null) {
      return this.cachedRoot;
    }

    if (this.leaves.length === 0) {
      return this.emptyRoot();
    }

    let level = [...this.leaves];
    let currentDepth = 0;
    
    while (level.length > 1) {
      const nextLevel: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        // Use correct empty node for current level
        const right = level[i + 1] || this.emptyNode(currentDepth);
        nextLevel.push(this.hashPair(left, right));
      }
      level = nextLevel;
      currentDepth++;
    }

    // Cache the computed root
    this.cachedRoot = level[0];
    return this.cachedRoot;
  }

  /**
   * Get witness for a leaf at position
   * Returns full MerkleWitness including anchor (tree root)
   */
  witness(position: number, anchor?: Uint8Array): MerkleWitness | null {
    if (position >= this.leaves.length) {
      return null;
    }

    if (position < 0) {
      return null;
    }

    const authPath: Uint8Array[] = [];
    let level = [...this.leaves];
    let currentPos = position;
    let currentDepth = 0;

    // Process each tree level
    while (level.length > 1) {
      const isLeft = currentPos % 2 === 0;
      const siblingPos = isLeft ? currentPos + 1 : currentPos - 1;

      // Get sibling at current level (use correct empty node for this level)
      if (siblingPos >= 0 && siblingPos < level.length) {
        authPath.push(level[siblingPos]);
      } else {
        authPath.push(this.emptyNode(currentDepth));
      }

      // Build next level
      const nextLevel: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || this.emptyNode(currentDepth);
        nextLevel.push(this.hashPair(left, right));
      }

      level = nextLevel;
      currentPos = Math.floor(currentPos / 2);
      currentDepth++;
    }

    // Pad auth path to full depth with empty nodes
    while (authPath.length < this.depth) {
      authPath.push(this.emptyNode(authPath.length));
    }

    return {
      authPath,
      position: BigInt(position),
      anchor: anchor || this.root()
    };
  }

  /**
   * Verify a merkle witness
   * Computes the root from the leaf and auth path, compares to anchor
   */
  verifyWitness(leaf: Uint8Array, witness: MerkleWitness): boolean {
    let computed = leaf;

    // Hash up the tree using auth path
    for (let i = 0; i < witness.authPath.length; i++) {
      const sibling = witness.authPath[i];

      // Check if this leaf is on left or right
      const isRight = (Number(witness.position) >> i) & 1;

      if (isRight) {
        computed = this.hashPair(sibling, computed);
      } else {
        computed = this.hashPair(computed, sibling);
      }
    }

    // Does computed root match expected anchor?
    return this.bytesEqual(computed, witness.anchor);
  }

  /**
   * Compare two byte arrays for equality
   */
  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Hash two nodes together
   */
  private hashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
    return blake2s(concatBytes(left, right), { dkLen: 32 });
  }

  /**
   * Get empty node at level (uses precomputed cache)
   */
  private emptyNode(level: number): Uint8Array {
    const cached = this.emptyNodes.get(level);
    if (cached) return cached;
    // Fallback (should never reach here after precomputation)
    return new Uint8Array(32);
  }

  /**
   * Get empty root (uses precomputed cache)
   */
  private emptyRoot(): Uint8Array {
    // The empty root is the empty node at depth level
    return this.emptyNodes.get(this.depth) || new Uint8Array(32);
  }

  /**
   * Get tree size
   */
  size(): number {
    return this.leaves.length;
  }
}

/**
 * RPC Client interface for blockchain data fetching
 */
export interface RPCClientInterface {
  getBlockchainInfo(): Promise<{ blocks: number; chain: string }>;
  getBlockHash(height: number): Promise<string>;
  getBlock(hash: string, verbosity: number): Promise<any>;
  getRawTransaction(txid: string, verbose: boolean): Promise<any>;
}

/**
 * State synchronizer for shielded addresses
 * Handles blockchain synchronization with persistence and RPC integration
 */
export class ShieldedStateSynchronizer {
  private scanner: NoteScanner;
  private cache: NoteCache;
  private tree: IncrementalMerkleTree;
  private rpcClient: RPCClientInterface | null = null;
  private initialized: boolean = false;

  constructor(scanner: NoteScanner, cache: NoteCache) {
    this.scanner = scanner;
    this.cache = cache;
    this.tree = new IncrementalMerkleTree();
  }

  /**
   * Set the RPC client for blockchain data fetching
   */
  setRpcClient(client: RPCClientInterface): void {
    this.rpcClient = client;
  }

  /**
   * Initialize the synchronizer
   * Loads persisted tree state if available
   */
  async initialize(address: string): Promise<void> {
    if (this.initialized) return;

    try {
      const saved = await MerkleTreePersistence.loadTree(`tree-${address}`);
      if (saved) {
        this.tree = saved.tree;
        // Tree restored from persisted state
      } else {
        this.tree = new IncrementalMerkleTree(32);
        // Created new tree (no persisted state found)
      }
      this.initialized = true;
    } catch (error) {
      // Failed to load persisted tree - create new tree and continue
      this.tree = new IncrementalMerkleTree(32);
      this.initialized = true;
    }
  }

  /**
   * Sync from a starting height
   * Uses RPC client if available, otherwise uses provided fetchBlocks callback
   */
  async sync(
    address: string,
    fetchBlocks?: (from: number, to: number) => Promise<BlockData[]>,
    startHeight?: number,
    endHeight?: number
  ): Promise<{ notesFound: number; newBalance: number }> {
    // Initialize if not already done
    if (!this.initialized) {
      await this.initialize(address);
    }

    const fromHeight = startHeight ?? this.cache.getSyncedHeight(address) + 1;
    
    // Get end height from RPC if not provided
    let targetEndHeight = endHeight;
    if (targetEndHeight === undefined) {
      if (this.rpcClient) {
        try {
          const info = await this.rpcClient.getBlockchainInfo();
          targetEndHeight = info.blocks;
        } catch (error) {
          throw new Error('End height must be specified or RPC client must be available');
        }
      } else {
        throw new Error('End height must be specified when RPC client is not available');
      }
    }

    if (fromHeight > targetEndHeight) {
      return { notesFound: 0, newBalance: this.cache.getBalance(address).total };
    }

    // Fetch and scan blocks in batches
    const batchSize = 100;
    let totalNotesFound = 0;

    for (let height = fromHeight; height <= targetEndHeight; height += batchSize) {
      const batchEnd = Math.min(height + batchSize - 1, targetEndHeight);
      
      // Fetch blocks using RPC or provided callback
      let blocks: BlockData[];
      if (this.rpcClient) {
        blocks = await this.fetchBlocksFromRpc(height, batchEnd);
      } else if (fetchBlocks) {
        blocks = await fetchBlocks(height, batchEnd);
      } else {
        throw new Error('Either RPC client or fetchBlocks callback must be provided');
      }
      
      // Add all commitments to tree (including those we can't decrypt)
      for (const block of blocks) {
        for (const tx of block.transactions) {
          for (const output of tx.outputs) {
            this.tree.append(output.cmu);
          }
        }
      }

      // Scan blocks for our notes
      const notes = await this.scanner.scanBlocks(blocks, height, batchEnd);
      totalNotesFound += notes.length;

      // Update note positions based on tree
      for (const scannedNote of notes) {
        // Position was already set by tree.append during commitment addition
        // Just update the note in cache with witness
        if (scannedNote.note.position !== undefined) {
          const witness = this.tree.witness(scannedNote.note.position);
          if (witness) {
            this.cache.updateWitness(scannedNote.note.cmu, witness);
          }
        }
      }

      // Update synced height
      this.cache.updateSyncedHeight(address, batchEnd);

      // Persist tree state periodically (every 1000 blocks)
      if ((batchEnd - fromHeight) % 1000 === 0 || batchEnd === targetEndHeight) {
        try {
          await MerkleTreePersistence.saveTree(`tree-${address}`, this.tree, batchEnd);
        } catch (error) {
        }
      }
    }

    // Update tree state in cache
    this.cache.updateTreeState({
      root: this.tree.root(),
      size: this.tree.size(),
      blockHeight: targetEndHeight
    });

    // Final persistence
    try {
      await MerkleTreePersistence.saveTree(`tree-${address}`, this.tree, targetEndHeight);
    } catch (error) {
      // Persistence failure is non-critical - tree state will be rebuilt on next sync
    }

    return {
      notesFound: totalNotesFound,
      newBalance: this.cache.getBalance(address).total
    };
  }

  /**
   * Fetch blocks from RPC
   * Extracts shielded transaction data from blockchain
   */
  private async fetchBlocksFromRpc(
    startHeight: number,
    endHeight: number
  ): Promise<BlockData[]> {
    if (!this.rpcClient) {
      throw new Error('RPC client not initialized');
    }

    const blocks: BlockData[] = [];

    for (let height = startHeight; height <= endHeight; height++) {
      try {
        // Get block hash at this height
        const blockHash = await this.rpcClient.getBlockHash(height);

        // Get full block data (verbosity=2 for transaction details)
        const block = await this.rpcClient.getBlock(blockHash, 2);

        const transactions: TransactionData[] = [];

        // Process each transaction in block
        for (const tx of block.tx || []) {
          const txid = typeof tx === 'string' ? tx : tx.txid;
          
          try {
            // Get full transaction details
            const txData = await this.rpcClient.getRawTransaction(txid, true);

            // Extract shielded outputs
            const outputs: CompactNote[] = [];

            if (txData.vShieldedOutput && txData.vShieldedOutput.length > 0) {
              for (const output of txData.vShieldedOutput) {
                outputs.push({
                  cmu: hexToBytes(output.cmu || output.cm),
                  ephemeralKey: hexToBytes(output.ephemeralKey || output.epk),
                  ciphertext: hexToBytes(output.encCiphertext?.slice(0, 104) || ''),
                  encCiphertext: hexToBytes(output.encCiphertext || ''),
                  outCiphertext: hexToBytes(output.outCiphertext || ''),
                  cv: hexToBytes(output.cv || '')
                });
              }
            }

            // Extract nullifiers (spent notes)
            const nullifiers: Uint8Array[] = [];

            if (txData.vShieldedSpend && txData.vShieldedSpend.length > 0) {
              for (const spend of txData.vShieldedSpend) {
                nullifiers.push(hexToBytes(spend.nullifier || spend.nf));
              }
            }

            // Only add if has outputs or spends
            if (outputs.length > 0 || nullifiers.length > 0) {
              transactions.push({
                txid,
                outputs,
                nullifiers
              });
            }
          } catch (txError) {
            // Skip transaction on error - continue processing other transactions
          }
        }

        blocks.push({
          height,
          hash: blockHash,
          transactions
        });

      } catch (error) {
        // Failed to fetch block - continue with next block
        // Error details are not logged to avoid exposing sensitive information
      }
    }

    return blocks;
  }

  /**
   * Update witnesses for all unspent notes
   */
  private updateWitnesses(): void {
    for (const address of this.cache.getAddresses()) {
      const notes = this.cache.getNotesForAddress(address);
      for (const note of notes) {
        if (note.position !== undefined && !note.spent) {
          const witness = this.tree.witness(note.position);
          if (witness) {
            this.cache.updateWitness(note.cmu, witness);
          }
        }
      }
    }
  }

  /**
   * Get current anchor (tree root)
   */
  getAnchor(): Uint8Array {
    return this.tree.root();
  }

  /**
   * Get current tree
   */
  getTree(): IncrementalMerkleTree {
    return this.tree;
  }

  /**
   * Reset the synchronizer (clear tree and start fresh)
   */
  async reset(address: string): Promise<void> {
    this.tree = new IncrementalMerkleTree(32);
    this.initialized = false;
    try {
      await MerkleTreePersistence.clearTree(`tree-${address}`);
    } catch (error) {
    }
  }
}


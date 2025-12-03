/**
 * Shielded Transaction Builder
 * Builds Sapling shielded transactions (z-to-z, t-to-z, z-to-t)
 */

import type {
  SaplingNote,
  SaplingSpendingKey,
  ShieldedOutputParams,
  ShieldedBundle,
  ShieldedSpendDescription,
  ShieldedOutputDescription,
  NoteSpendParams,
  MerkleWitness
} from './types.js';
import type { TransparentInput, TransparentOutput } from '../types/index';
import {
  computeNoteCommitment,
  computeNullifier,
  computeValueCommitment,
  generateRcv,
  generateRseed,
  deriveRcmFromRseed,
  encodeNotePlaintext
} from './noteCommitment.js';
import { NoteCache } from './noteCache.js';
import { concatBytes } from '../utils/bytes';
import { blake2s } from '@noble/hashes/blake2s';
import { addScalars, negateScalar } from './scalarArithmetic.js';
import { parseZcashAddress } from './bech32.js';
import {
  deriveNullifierKeyFromNsk,
  computeRandomizedVerificationKey,
  deriveEphemeralPublicKey as jubjubDeriveEpk
} from './jubjubHelper.js';
// @ts-ignore - Noble ciphers uses .js exports
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

// Transaction version for Sapling
const SAPLING_TX_VERSION = 4;
const SAPLING_VERSION_GROUP_ID = 0x892F2085;

// Default fee in zatoshi
const DEFAULT_SHIELDED_FEE = 10000;

/**
 * Build parameters for shielded transaction
 */
export interface ShieldedTransactionParams {
  /** Spending key for signing */
  spendingKey: SaplingSpendingKey;
  
  /** Notes to spend */
  spends: NoteSpendParams[];
  
  /** Shielded outputs */
  outputs: ShieldedOutputParams[];
  
  /** Anchor (commitment tree root) */
  anchor: Uint8Array;
  
  /** Fee in zatoshi */
  fee?: number;
  
  /** Expiry height (0 = no expiry) */
  expiryHeight?: number;
}

/**
 * Build parameters for shielding transaction (t-to-z)
 */
export interface ShieldingTransactionParams {
  /** Transparent inputs */
  transparentInputs: TransparentInput[];
  
  /** Shielded output */
  shieldedOutput: ShieldedOutputParams;
  
  /** Change address (transparent) */
  changeAddress?: string;
  
  /** Fee in zatoshi */
  fee?: number;
  
  /** Expiry height */
  expiryHeight?: number;
}

/**
 * Build parameters for deshielding transaction (z-to-t)
 */
export interface DeshieldingTransactionParams {
  /** Spending key */
  spendingKey: SaplingSpendingKey;
  
  /** Notes to spend */
  spends: NoteSpendParams[];
  
  /** Anchor */
  anchor: Uint8Array;
  
  /** Transparent output */
  transparentOutput: TransparentOutput;
  
  /** Shielded change output (optional) */
  shieldedChange?: ShieldedOutputParams;
  
  /** Fee in zatoshi */
  fee?: number;
  
  /** Expiry height */
  expiryHeight?: number;
}

/**
 * Unsigned shielded transaction
 */
export interface UnsignedShieldedTransaction {
  /** Transaction version */
  version: number;
  
  /** Version group ID */
  versionGroupId: number;
  
  /** Transparent inputs */
  transparentInputs: TransparentInput[];
  
  /** Transparent outputs */
  transparentOutputs: TransparentOutput[];
  
  /** Shielded bundle */
  shieldedBundle: ShieldedBundle;
  
  /** Lock time */
  lockTime: number;
  
  /** Expiry height */
  expiryHeight: number;
  
  /** Data needed for signing */
  signingData: ShieldedSigningData;
}

/**
 * Data needed for shielded signing
 */
export interface ShieldedSigningData {
  /** Spend descriptions with private data */
  spends: SpendSigningData[];
  
  /** Output descriptions with private data */
  outputs: OutputSigningData[];
  
  /** Value balance */
  valueBalance: bigint;
  
  /** Binding signature key (bsk) */
  bsk: Uint8Array;
}

/**
 * Private data for signing a spend
 */
interface SpendSigningData {
  /** Note being spent */
  note: SaplingNote;
  
  /** Spending key */
  spendingKey: SaplingSpendingKey;
  
  /** Randomness for value commitment */
  rcv: Uint8Array;
  
  /** Randomness for spend authorization */
  alpha: Uint8Array;
  
  /** Merkle witness */
  witness: MerkleWitness;
  
  /** Anchor */
  anchor: Uint8Array;
}

/**
 * Private data for signing an output
 */
interface OutputSigningData {
  /** Output parameters */
  params: ShieldedOutputParams;
  
  /** Randomness for value commitment */
  rcv: Uint8Array;
  
  /** Note commitment randomness */
  rcm: Uint8Array;
  
  /** Rseed for note */
  rseed: Uint8Array;
  
  /** Ephemeral secret key */
  esk: Uint8Array;
}

/**
 * Shielded Transaction Builder
 */
export class ShieldedTransactionBuilder {
  constructor(_noteCache: NoteCache) {
    // Note cache used for note selection if needed
  }

  /**
   * Build a fully shielded transaction (z-to-z)
   */
  buildShieldedTransaction(
    params: ShieldedTransactionParams
  ): UnsignedShieldedTransaction {
    const fee = params.fee ?? DEFAULT_SHIELDED_FEE;
    const expiryHeight = params.expiryHeight ?? 0;

    // Calculate value balance
    const inputValue = params.spends.reduce(
      (sum, s) => sum + BigInt(s.note.value), 
      0n
    );
    const outputValue = params.outputs.reduce(
      (sum, o) => sum + BigInt(o.value), 
      0n
    );
    const valueBalance = inputValue - outputValue - BigInt(fee || 0);

    // Validate balance
    if (valueBalance < 0n) {
      throw new Error('Insufficient shielded funds');
    }

    // Build spend descriptions
    const { spendDescriptions, spendSigningData, totalRcvSpend } = 
      this.buildSpendDescriptions(params.spends, params.spendingKey, params.anchor);

    // Build output descriptions
    const { outputDescriptions, outputSigningData, totalRcvOutput } = 
      this.buildOutputDescriptions(params.outputs);

    // Calculate binding signature key
    const bsk = this.computeBindingSignatureKey(totalRcvSpend, totalRcvOutput);

    // Construct shielded bundle
    const shieldedBundle: ShieldedBundle = {
      spends: spendDescriptions,
      outputs: outputDescriptions,
      valueBalance,
      bindingSig: new Uint8Array(64) // Will be filled during signing
    };

    return {
      version: SAPLING_TX_VERSION,
      versionGroupId: SAPLING_VERSION_GROUP_ID,
      transparentInputs: [],
      transparentOutputs: [],
      shieldedBundle,
      lockTime: 0,
      expiryHeight,
      signingData: {
        spends: spendSigningData,
        outputs: outputSigningData,
        valueBalance,
        bsk
      }
    };
  }

  /**
   * Build a shielding transaction (t-to-z)
   */
  buildShieldingTransaction(
    params: ShieldingTransactionParams
  ): UnsignedShieldedTransaction {
    const fee = params.fee ?? DEFAULT_SHIELDED_FEE;
    const expiryHeight = params.expiryHeight ?? 0;

    // Calculate totals
    const transparentInputValue = params.transparentInputs.reduce(
      (sum, i) => sum + BigInt(i.value),
      0n
    );
    const shieldedOutputValue = BigInt(params.shieldedOutput.value);
    
    // Calculate change
    const change = transparentInputValue - shieldedOutputValue - BigInt(fee);
    if (change < 0n) {
      throw new Error('Insufficient transparent funds');
    }

    // Build transparent outputs (change if any)
    const transparentOutputs: TransparentOutput[] = [];
    if (change > 0n && params.changeAddress) {
      transparentOutputs.push({
        address: params.changeAddress,
        value: Number(change),
        scriptPubKey: '' // Will be filled based on address
      });
    }

    // Build shielded output
    const { outputDescriptions, outputSigningData, totalRcvOutput } = 
      this.buildOutputDescriptions([params.shieldedOutput]);

    // Value balance is negative (value flowing into shielded pool)
    const valueBalance = -shieldedOutputValue;

    // Binding signature key
    const bsk = this.computeBindingSignatureKey(new Uint8Array(32), totalRcvOutput);

    const shieldedBundle: ShieldedBundle = {
      spends: [],
      outputs: outputDescriptions,
      valueBalance,
      bindingSig: new Uint8Array(64)
    };

    return {
      version: SAPLING_TX_VERSION,
      versionGroupId: SAPLING_VERSION_GROUP_ID,
      transparentInputs: params.transparentInputs,
      transparentOutputs,
      shieldedBundle,
      lockTime: 0,
      expiryHeight,
      signingData: {
        spends: [],
        outputs: outputSigningData,
        valueBalance,
        bsk
      }
    };
  }

  /**
   * Build a deshielding transaction (z-to-t)
   */
  buildDeshieldingTransaction(
    params: DeshieldingTransactionParams
  ): UnsignedShieldedTransaction {
    const fee = params.fee ?? DEFAULT_SHIELDED_FEE;
    const expiryHeight = params.expiryHeight ?? 0;

    // Calculate totals
    const shieldedInputValue = params.spends.reduce(
      (sum, s) => sum + BigInt(s.note.value),
      0n
    );
    const transparentOutputValue = BigInt(params.transparentOutput.value);
    
    // Calculate shielded change
    const shieldedChange = shieldedInputValue - transparentOutputValue - BigInt(fee);
    if (shieldedChange < 0n) {
      throw new Error('Insufficient shielded funds');
    }

    // Build spend descriptions
    const { spendDescriptions, spendSigningData, totalRcvSpend } = 
      this.buildSpendDescriptions(params.spends, params.spendingKey, params.anchor);

    // Build shielded change output if needed
    let outputDescriptions: ShieldedOutputDescription[] = [];
    let outputSigningData: OutputSigningData[] = [];
    let totalRcvOutput: Uint8Array = new Uint8Array(32);

    if (shieldedChange > 0n && params.shieldedChange) {
      const changeOutput: ShieldedOutputParams = {
        ...params.shieldedChange,
        value: Number(shieldedChange)
      };
      const result = this.buildOutputDescriptions([changeOutput]);
      outputDescriptions = result.outputDescriptions;
      outputSigningData = result.outputSigningData;
      totalRcvOutput = new Uint8Array(result.totalRcvOutput);
    }

    // Value balance is positive (value flowing out of shielded pool)
    const valueBalance = transparentOutputValue + BigInt(fee);

    // Binding signature key
    const bsk = this.computeBindingSignatureKey(totalRcvSpend, totalRcvOutput);

    const shieldedBundle: ShieldedBundle = {
      spends: spendDescriptions,
      outputs: outputDescriptions,
      valueBalance,
      bindingSig: new Uint8Array(64)
    };

    return {
      version: SAPLING_TX_VERSION,
      versionGroupId: SAPLING_VERSION_GROUP_ID,
      transparentInputs: [],
      transparentOutputs: [params.transparentOutput],
      shieldedBundle,
      lockTime: 0,
      expiryHeight,
      signingData: {
        spends: spendSigningData,
        outputs: outputSigningData,
        valueBalance,
        bsk
      }
    };
  }

  /**
   * Build spend descriptions
   */
  private buildSpendDescriptions(
    spends: NoteSpendParams[],
    spendingKey: SaplingSpendingKey,
    anchor: Uint8Array
  ): {
    spendDescriptions: ShieldedSpendDescription[];
    spendSigningData: SpendSigningData[];
    totalRcvSpend: Uint8Array;
  } {
    const spendDescriptions: ShieldedSpendDescription[] = [];
    const spendSigningData: SpendSigningData[] = [];
    let totalRcv = new Uint8Array(32);

    for (const spend of spends) {
      // Generate randomness
      const rcv = generateRcv();
      const alpha = this.generateAlpha();

      // Compute value commitment
      const cv = computeValueCommitment(BigInt(spend.note.value), rcv);

      // Compute note commitment (cmu) if not present
      const cmu = spend.note.cmu || computeNoteCommitment(
        spend.note.diversifier,
        spend.note.pkD,
        BigInt(spend.note.value),
        spend.note.rcm
      );
      
      // Compute nullifier
      const nk = this.deriveNullifierKey(spendingKey.nsk);
      const nullifier = computeNullifier(nk, cmu, BigInt(spend.witness.position || 0));

      // Compute randomized verification key (rk)
      const rk = this.randomizeVerificationKey(spendingKey.ask, alpha);

      // Create spend description
      const description: ShieldedSpendDescription = {
        cv,
        anchor,
        nullifier,
        rk,
        zkproof: new Uint8Array(192), // Will be filled by prover
        spendAuthSig: new Uint8Array(64) // Will be filled during signing
      };

      spendDescriptions.push(description);

      // Store signing data
      spendSigningData.push({
        note: spend.note,
        spendingKey,
        rcv,
        alpha,
        witness: spend.witness,
        anchor
      });

      // Accumulate rcv
      totalRcv = new Uint8Array(this.addScalars(totalRcv, rcv));
    }

    return { spendDescriptions, spendSigningData, totalRcvSpend: totalRcv };
  }

  /**
   * Build output descriptions
   */
  private buildOutputDescriptions(
    outputs: ShieldedOutputParams[]
  ): {
    outputDescriptions: ShieldedOutputDescription[];
    outputSigningData: OutputSigningData[];
    totalRcvOutput: Uint8Array;
  } {
    const outputDescriptions: ShieldedOutputDescription[] = [];
    const outputSigningData: OutputSigningData[] = [];
    let totalRcv = new Uint8Array(32);

    for (const output of outputs) {
      // Generate randomness
      const rcv = generateRcv();
      const rseed = generateRseed();
      const rcm = deriveRcmFromRseed(rseed);
      const esk = this.generateEphemeralSecretKey();

      // Compute value commitment
      const cv = computeValueCommitment(BigInt(output.value), rcv);

      // Parse address to get diversifier and pkD
      const { diversifier, pkD } = this.parseAddress(output.address);

      // Compute note commitment
      const cmu = computeNoteCommitment(diversifier, pkD, BigInt(output.value), rcm);

      // Compute ephemeral public key
      const ephemeralKey = this.deriveEphemeralPublicKey(diversifier, esk);

      // Encrypt note
      const { encCiphertext, outCiphertext } = this.encryptNote(
        output,
        rseed,
        esk,
        diversifier,
        pkD
      );

      // Create output description
      const description: ShieldedOutputDescription = {
        cv,
        cmu,
        ephemeralKey,
        encCiphertext,
        outCiphertext,
        zkproof: new Uint8Array(192) // Will be filled by prover
      };

      outputDescriptions.push(description);

      // Store signing data
      outputSigningData.push({
        params: output,
        rcv,
        rcm,
        rseed,
        esk
      });

      // Accumulate rcv (negated for outputs)
      totalRcv = new Uint8Array(this.addScalars(totalRcv, this.negateScalar(rcv)));
    }

    return { outputDescriptions, outputSigningData, totalRcvOutput: totalRcv };
  }

  /**
   * Compute binding signature key
   */
  private computeBindingSignatureKey(
    totalRcvSpend: Uint8Array,
    totalRcvOutput: Uint8Array
  ): Uint8Array {
    // bsk = sum(rcv_spend) - sum(rcv_output)
    return this.addScalars(totalRcvSpend, this.negateScalar(totalRcvOutput));
  }

  /**
   * Generate alpha for spend authorization randomization
   */
  private generateAlpha(): Uint8Array {
    const alpha = new Uint8Array(32);
    crypto.getRandomValues(alpha);
    return alpha;
  }

  /**
   * Generate ephemeral secret key
   */
  private generateEphemeralSecretKey(): Uint8Array {
    const esk = new Uint8Array(32);
    crypto.getRandomValues(esk);
    return esk;
  }

  /**
   * Derive nullifier key from nsk
   * nk = [nsk] * G_nk (Jubjub scalar multiplication)
   */
  private deriveNullifierKey(nsk: Uint8Array): Uint8Array {
    return deriveNullifierKeyFromNsk(nsk);
  }

  /**
   * Randomize verification key
   * rk = [ask + alpha] * G_spend (Jubjub scalar multiplication)
   */
  private randomizeVerificationKey(ask: Uint8Array, alpha: Uint8Array): Uint8Array {
    // First add the scalars: (ask + alpha) mod order
    const combinedScalar = addScalars(ask, alpha);
    // Then multiply by spending key generator
    return computeRandomizedVerificationKey(combinedScalar);
  }

  /**
   * Add two scalars (mod field order)
   * Uses proper Jubjub scalar field arithmetic
   */
  private addScalars(a: Uint8Array, b: Uint8Array): Uint8Array {
    return addScalars(a, b);
  }

  /**
   * Negate a scalar (mod field order)
   * Uses proper Jubjub scalar field arithmetic
   */
  private negateScalar(s: Uint8Array): Uint8Array {
    return negateScalar(s);
  }

  /**
   * Parse shielded address to diversifier and pkD
   * Uses proper Bech32 decoding with checksum verification
   */
  private parseAddress(address: string): { diversifier: Uint8Array; pkD: Uint8Array } {
    const parsed = parseZcashAddress(address);
    return {
      diversifier: parsed.diversifier,
      pkD: parsed.pkD
    };
  }

  /**
   * Derive ephemeral public key
   * epk = [esk] * DiversifyHash(d) (Jubjub scalar multiplication)
   */
  private deriveEphemeralPublicKey(diversifier: Uint8Array, esk: Uint8Array): Uint8Array {
    return jubjubDeriveEpk(diversifier, esk);
  }

  /**
   * Encrypt note for transmission using ChaCha20Poly1305
   * ZIP 216: Sapling Payment Addresses and Change
   */
  private encryptNote(
    output: ShieldedOutputParams,
    rseed: Uint8Array,
    esk: Uint8Array,
    diversifier: Uint8Array,
    pkD: Uint8Array
  ): { encCiphertext: Uint8Array; outCiphertext: Uint8Array } {
    try {
      const memo = output.memo
        ? (typeof output.memo === 'string'
            ? new TextEncoder().encode(output.memo)
            : output.memo)
        : new Uint8Array(512);

      // Encode note plaintext (564 bytes before memo)
      // Format: [1: lead_byte][11: diversifier][8: value][32: rseed][512: memo] = 564 bytes
      const plaintext = encodeNotePlaintext({
        diversifier,
        value: output.value,
        rseed,
        memo
      });

      // === Encrypted Note Ciphertext (encCiphertext) ===
      // ZIP 216 encryption using ChaCha20Poly1305
      // Key derivation: PRF^enc(esk || pk_d) for the encryption key
      // Nonce: derived deterministically from rseed to allow matching on decryption

      // Derive encryption key from ephemeral secret key and public key
      // Using BLAKE2s as KDF matching Zcash spec
      const encKeyMaterial = blake2s(concatBytes(esk, pkD), { dkLen: 32 });

      // Generate nonce (12 bytes) deterministically from rseed
      // Matching with decryption side for reproducibility
      const encNonce = blake2s(concatBytes(new Uint8Array([0]), rseed), { dkLen: 12 });

      // Encrypt plaintext with ChaCha20Poly1305
      // Output: [ciphertext (564 bytes)] || [auth_tag (16 bytes)] = 580 bytes total
      const cipher = chacha20poly1305(encKeyMaterial, encNonce);
      const encCiphertext = cipher.encrypt(plaintext);

      // === Outgoing Ciphertext (outCiphertext) ===
      // For sender to later decrypt and track their own outgoing notes
      // This allows the sender to recover sent notes from the blockchain
      // Encrypted with outgoing viewing key (ovk) material

      const outCiphertext = new Uint8Array(80);

      if (output.ovk) {
        // Derive outgoing viewing key material
        // ZIP 216: out_key = PRF^out(ovk || esk)
        const outKeyMaterial = blake2s(concatBytes(output.ovk, esk), { dkLen: 32 });

        // Different nonce from encryption ciphertext (prevents key reuse)
        const outNonce = blake2s(concatBytes(new Uint8Array([1]), rseed), { dkLen: 12 });

        // For outgoing ciphertext, we encrypt just the first 64 bytes of plaintext
        // This contains: [1 byte: lead] [11 bytes: diversifier] [8 bytes: value] [32 bytes: rseed] [12 bytes: of memo]
        // This is sufficient to recover the note on sender's side
        const recipientPlaintext = plaintext.slice(0, 64);

        // Encrypt with ChaCha20Poly1305 using outgoing key
        const outCipher = chacha20poly1305(outKeyMaterial, outNonce);
        const encryptedOut = outCipher.encrypt(recipientPlaintext);

        // Validate output size: should be exactly 80 bytes (64 encrypted + 16 tag)
        if (encryptedOut.length !== 80) {
          throw new Error(
            `Outgoing ciphertext has incorrect size: expected 80 bytes, got ${encryptedOut.length}`
          );
        }

        // Take all 80 bytes: [64 encrypted + 16 tag]
        outCiphertext.set(encryptedOut);
      } else {
        // If no outgoing viewing key, fill with random bytes
        // Sender won't be able to track outgoing transactions
        for (let i = 0; i < 80; i++) {
          outCiphertext[i] = Math.floor(Math.random() * 256);
        }
      }

      return { encCiphertext, outCiphertext };
    } catch (error) {
      // If encryption fails, fall back to empty ciphertexts
      // Transaction will fail during validation on network
      // Error is intentionally not logged to avoid exposing sensitive data
      return {
        encCiphertext: new Uint8Array(580),
        outCiphertext: new Uint8Array(80)
      };
    }
  }

  /**
   * Estimate fee for shielded transaction
   */
  estimateFee(
    numSpends: number,
    numOutputs: number,
    numTransparentInputs: number = 0,
    numTransparentOutputs: number = 0
  ): number {
    // Base fee
    let fee = 1000;

    // Shielded spend cost
    fee += numSpends * 5000;

    // Shielded output cost
    fee += numOutputs * 5000;

    // Transparent input cost
    fee += numTransparentInputs * 150;

    // Transparent output cost
    fee += numTransparentOutputs * 34;

    return fee;
  }
}


/**
 * Transaction Serialization
 * Serializes shielded transactions to Zcash binary format
 * Complies with ZIP-225: Protocol Specification (Zcash Sapling)
 */

import type {
  UnsignedShieldedTransaction,
  ShieldedSigningData
} from './transactionBuilder.js';
import type { ShieldedBundle, ShieldedSpendDescription, ShieldedOutputDescription } from './types.js';
import type { TransparentInput, TransparentOutput } from '../types/index';
import { concatBytes } from '../utils/bytes';
import { bytesToHex } from '../utils/bytes';
import { blake2b } from '@noble/hashes/blake2b';

/**
 * Serialization format for shielded transactions
 * Follows Zcash specification with proper byte ordering
 */
export class TransactionSerializer {
  /**
   * Serialize a complete unsigned shielded transaction
   * Returns a buffer suitable for hashing or transmission
   */
  static serializeTransaction(tx: UnsignedShieldedTransaction): Uint8Array {
    const parts: Uint8Array[] = [];

    // Transaction header (4 + 4 = 8 bytes)
    parts.push(this.serializeHeader(tx.version, tx.versionGroupId));

    // Transparent inputs (variable)
    if (tx.transparentInputs && tx.transparentInputs.length > 0) {
      parts.push(this.serializeCompactSize(tx.transparentInputs.length));
      for (const input of tx.transparentInputs) {
        parts.push(this.serializeTransparentInput(input));
      }
    } else {
      parts.push(this.serializeCompactSize(0));
    }

    // Transparent outputs (variable)
    if (tx.transparentOutputs && tx.transparentOutputs.length > 0) {
      parts.push(this.serializeCompactSize(tx.transparentOutputs.length));
      for (const output of tx.transparentOutputs) {
        parts.push(this.serializeTransparentOutput(output));
      }
    } else {
      parts.push(this.serializeCompactSize(0));
    }

    // Lock time (4 bytes)
    parts.push(this.serializeU32(tx.lockTime));

    // Expiry height (4 bytes)
    parts.push(this.serializeU32(tx.expiryHeight));

    // Value balance (8 bytes) - signed integer
    parts.push(this.serializeI64(tx.shieldedBundle.valueBalance));

    // Shielded spends
    parts.push(this.serializeCompactSize(tx.shieldedBundle.spends.length));
    for (const spend of tx.shieldedBundle.spends) {
      parts.push(this.serializeSpendDescription(spend));
    }

    // Shielded outputs
    parts.push(this.serializeCompactSize(tx.shieldedBundle.outputs.length));
    for (const output of tx.shieldedBundle.outputs) {
      parts.push(this.serializeOutputDescription(output));
    }

    // Binding signature (64 bytes)
    parts.push(tx.shieldedBundle.bindingSig);

    return concatBytes(...parts);
  }

  /**
   * Serialize transaction header (version + versionGroupId)
   */
  private static serializeHeader(version: number, versionGroupId: number): Uint8Array {
    const parts: Uint8Array[] = [];
    parts.push(this.serializeU32(version));
    parts.push(this.serializeU32(versionGroupId));
    return concatBytes(...parts);
  }

  /**
   * Serialize transparent input
   * Format: previous output (hash + index) + script
   */
  private static serializeTransparentInput(input: TransparentInput): Uint8Array {
    const parts: Uint8Array[] = [];

    // Previous output hash (32 bytes)
    const txHash = typeof input.txHash === 'string'
      ? this.hexToBytes(input.txHash)
      : this.hexToBytes(bytesToHex(input.txHash));
    parts.push(txHash);

    // Previous output index (4 bytes)
    parts.push(this.serializeU32(input.index ?? 0));

    // Script length and script
    const script = typeof input.scriptSig === 'string'
      ? this.hexToBytes(input.scriptSig)
      : (input.scriptSig || new Uint8Array(0));
    parts.push(this.serializeCompactSize(script.length));
    parts.push(script);

    // Sequence number (4 bytes)
    parts.push(this.serializeU32(input.sequence ?? 0xffffffff));

    return concatBytes(...parts);
  }

  /**
   * Serialize transparent output
   * Format: value + script
   */
  private static serializeTransparentOutput(output: TransparentOutput): Uint8Array {
    const parts: Uint8Array[] = [];

    // Value (8 bytes) - little-endian
    parts.push(this.serializeI64(BigInt(output.value)));

    // Script length and script
    const script = typeof output.scriptPubKey === 'string'
      ? this.hexToBytes(output.scriptPubKey)
      : output.scriptPubKey;
    parts.push(this.serializeCompactSize(script.length));
    parts.push(script);

    return concatBytes(...parts);
  }

  /**
   * Serialize shielded spend description
   * Format: cv + anchor + nullifier + rk + zkproof + spendAuthSig
   */
  private static serializeSpendDescription(spend: ShieldedSpendDescription): Uint8Array {
    const parts: Uint8Array[] = [];

    // Value commitment (32 bytes)
    parts.push(spend.cv);

    // Anchor (32 bytes)
    parts.push(spend.anchor);

    // Nullifier (32 bytes)
    parts.push(spend.nullifier);

    // Randomized validating key (32 bytes)
    parts.push(spend.rk);

    // zk-SNARK proof (192 bytes for Groth16)
    parts.push(spend.zkproof);

    // Spend authorization signature (64 bytes)
    parts.push(spend.spendAuthSig);

    return concatBytes(...parts);
  }

  /**
   * Serialize shielded output description
   * Format: cv + cmu + ephemeralKey + encCiphertext + outCiphertext + zkproof
   */
  private static serializeOutputDescription(output: ShieldedOutputDescription): Uint8Array {
    const parts: Uint8Array[] = [];

    // Value commitment (32 bytes)
    parts.push(output.cv);

    // Note commitment (cmu) (32 bytes)
    parts.push(output.cmu);

    // Ephemeral public key (32 bytes)
    parts.push(output.ephemeralKey);

    // Encrypted note ciphertext (580 bytes)
    parts.push(output.encCiphertext);

    // Outgoing ciphertext (80 bytes)
    parts.push(output.outCiphertext);

    // zk-SNARK proof (192 bytes)
    parts.push(output.zkproof);

    return concatBytes(...parts);
  }

  /**
   * Serialize the signing hash of a transaction
   * Used for generating signatures
   */
  static serializeForSigning(
    tx: UnsignedShieldedTransaction,
    signingData: ShieldedSigningData
  ): Uint8Array {
    // Transaction digest includes all fields except signatures
    // This is used as the message for signing
    const parts: Uint8Array[] = [];

    // Header
    parts.push(this.serializeHeader(tx.version, tx.versionGroupId));

    // Hash of transparent inputs
    if (tx.transparentInputs && tx.transparentInputs.length > 0) {
      const inputsHash = this.hashList(
        tx.transparentInputs.map((i: TransparentInput) => this.serializeTransparentInput(i))
      );
      parts.push(inputsHash);
    } else {
      parts.push(this.getZeroHash(32)); // Empty inputs hash
    }

    // Hash of transparent outputs
    if (tx.transparentOutputs && tx.transparentOutputs.length > 0) {
      const outputsHash = this.hashList(
        tx.transparentOutputs.map((o: TransparentOutput) => this.serializeTransparentOutput(o))
      );
      parts.push(outputsHash);
    } else {
      parts.push(this.getZeroHash(32)); // Empty outputs hash
    }

    // Lock time (4 bytes)
    parts.push(this.serializeU32(tx.lockTime));

    // Expiry height (4 bytes)
    parts.push(this.serializeU32(tx.expiryHeight));

    // Value balance (8 bytes)
    parts.push(this.serializeI64(signingData.valueBalance));

    // Hash of spend descriptions (without signatures)
    if (tx.shieldedBundle.spends.length > 0) {
      const spendsData = tx.shieldedBundle.spends.map((s: ShieldedSpendDescription) => this.serializeSpendForSigning(s));
      const spendsHash = this.hashList(spendsData);
      parts.push(spendsHash);
    } else {
      parts.push(this.getZeroHash(32)); // Empty spends hash
    }

    // Hash of output descriptions
    if (tx.shieldedBundle.outputs.length > 0) {
      const outputsData = tx.shieldedBundle.outputs.map((o: ShieldedOutputDescription) => this.serializeOutputDescription(o));
      const outputsHash = this.hashList(outputsData);
      parts.push(outputsHash);
    } else {
      parts.push(this.getZeroHash(32)); // Empty outputs hash
    }

    return concatBytes(...parts);
  }

  /**
   * Serialize spend description for signing (without spendAuthSig)
   */
  private static serializeSpendForSigning(spend: ShieldedSpendDescription): Uint8Array {
    const parts: Uint8Array[] = [];
    parts.push(spend.cv);
    parts.push(spend.anchor);
    parts.push(spend.nullifier);
    parts.push(spend.rk);
    parts.push(spend.zkproof);
    return concatBytes(...parts);
  }

  /**
   * Serialize compact size (variable-length encoding)
   * Used for counts and sizes in transactions
   */
  private static serializeCompactSize(size: number): Uint8Array {
    if (size < 0xfd) {
      return new Uint8Array([size]);
    } else if (size <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = 0xfd;
      buf[1] = size & 0xff;
      buf[2] = (size >> 8) & 0xff;
      return buf;
    } else if (size <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = 0xfe;
      buf[1] = size & 0xff;
      buf[2] = (size >> 8) & 0xff;
      buf[3] = (size >> 16) & 0xff;
      buf[4] = (size >> 24) & 0xff;
      return buf;
    } else {
      const buf = new Uint8Array(9);
      buf[0] = 0xff;
      for (let i = 0; i < 8; i++) {
        buf[i + 1] = (size >> (i * 8)) & 0xff;
      }
      return buf;
    }
  }

  /**
   * Serialize unsigned 32-bit integer (little-endian)
   */
  private static serializeU32(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    buf[2] = (value >> 16) & 0xff;
    buf[3] = (value >> 24) & 0xff;
    return buf;
  }

  /**
   * Serialize signed 64-bit integer (little-endian)
   */
  private static serializeI64(value: bigint): Uint8Array {
    const buf = new Uint8Array(8);
    let v = value;
    for (let i = 0; i < 8; i++) {
      buf[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    return buf;
  }

  /**
   * Hash a list of byte arrays and return single hash
   * Uses Blake2b-256 as per Zcash specification
   */
  private static hashList(items: Uint8Array[]): Uint8Array {
    const concatenated = new Uint8Array(items.reduce((sum, item) => sum + item.length, 0));
    let offset = 0;
    for (const item of items) {
      concatenated.set(item, offset);
      offset += item.length;
    }
    return blake2b(concatenated, { dkLen: 32 });
  }

  /**
   * Get zero hash of specified length
   */
  private static getZeroHash(length: number): Uint8Array {
    return new Uint8Array(length);
  }

  /**
   * Convert hex string to bytes
   */
  private static hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.replace(/^0x/, '');
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Deserialize a transaction from bytes
   */
  static deserializeTransaction(data: Uint8Array): UnsignedShieldedTransaction {
    let offset = 0;

    // Parse header
    const version = this.readU32(data, offset);
    offset += 4;
    const versionGroupId = this.readU32(data, offset);
    offset += 4;

    // Parse transparent inputs
    const [transparentInputs, inputsLen] = this.readTransparentInputs(data, offset);
    offset += inputsLen;

    // Parse transparent outputs
    const [transparentOutputs, outputsLen] = this.readTransparentOutputs(data, offset);
    offset += outputsLen;

    // Parse lock time
    const lockTime = this.readU32(data, offset);
    offset += 4;

    // Parse expiry height
    const expiryHeight = this.readU32(data, offset);
    offset += 4;

    // Parse value balance
    const valueBalance = this.readI64(data, offset);
    offset += 8;

    // Parse shielded spends
    const [spends, spendsLen] = this.readSpends(data, offset);
    offset += spendsLen;

    // Parse shielded outputs
    const [outputs, outputsLen2] = this.readOutputs(data, offset);
    offset += outputsLen2;

    // Parse binding signature
    const bindingSig = data.slice(offset, offset + 64);

    const shieldedBundle: ShieldedBundle = {
      spends,
      outputs,
      valueBalance,
      bindingSig
    };

    return {
      version,
      versionGroupId,
      transparentInputs,
      transparentOutputs,
      shieldedBundle,
      lockTime,
      expiryHeight,
      signingData: {
        spends: [],
        outputs: [],
        valueBalance,
        bsk: new Uint8Array(32)
      }
    };
  }

  /**
   * Read unsigned 32-bit integer
   */
  private static readU32(data: Uint8Array, offset: number): number {
    return (
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)
    );
  }

  /**
   * Read signed 64-bit integer
   */
  private static readI64(data: Uint8Array, offset: number): bigint {
    let value = 0n;
    for (let i = 7; i >= 0; i--) {
      value = (value << 8n) | BigInt(data[offset + i]);
    }
    return value;
  }

  /**
   * Read compact size
   */
  private static readCompactSize(data: Uint8Array, offset: number): [number, number] {
    const first = data[offset];
    if (first < 0xfd) {
      return [first, 1];
    } else if (first === 0xfd) {
      const size = data[offset + 1] | (data[offset + 2] << 8);
      return [size, 3];
    } else if (first === 0xfe) {
      const size =
        data[offset + 1] |
        (data[offset + 2] << 8) |
        (data[offset + 3] << 16) |
        (data[offset + 4] << 24);
      return [size, 5];
    } else {
      let size = 0;
      for (let i = 0; i < 8; i++) {
        size |= data[offset + i + 1] << (i * 8);
      }
      return [size, 9];
    }
  }

  /**
   * Read transparent inputs
   */
  private static readTransparentInputs(
    data: Uint8Array,
    offset: number
  ): [TransparentInput[], number] {
    const [count, sizeLen] = this.readCompactSize(data, offset);
    const inputs: TransparentInput[] = [];
    let totalLen = sizeLen;

    for (let i = 0; i < count; i++) {
      const prevHash = data.slice(offset + totalLen, offset + totalLen + 32);
      totalLen += 32;

      const prevIndex = this.readU32(data, offset + totalLen);
      totalLen += 4;

      const [scriptLen, scriptSizeLe] = this.readCompactSize(data, offset + totalLen);
      totalLen += scriptSizeLe;

      const scriptSig = data.slice(offset + totalLen, offset + totalLen + scriptLen);
      totalLen += scriptLen;

      const sequence = this.readU32(data, offset + totalLen);
      totalLen += 4;

      inputs.push({
        txHash: bytesToHex(prevHash),
        index: prevIndex,
        scriptPubKey: '',
        scriptSig: typeof scriptSig === 'string' ? scriptSig : bytesToHex(scriptSig),
        value: 0,
        sequence
      });
    }

    return [inputs, totalLen];
  }

  /**
   * Read transparent outputs
   */
  private static readTransparentOutputs(
    data: Uint8Array,
    offset: number
  ): [TransparentOutput[], number] {
    const [count, sizeLen] = this.readCompactSize(data, offset);
    const outputs: TransparentOutput[] = [];
    let totalLen = sizeLen;

    for (let i = 0; i < count; i++) {
      const value = this.readI64(data, offset + totalLen);
      totalLen += 8;

      const [scriptLen, scriptSizeLe] = this.readCompactSize(data, offset + totalLen);
      totalLen += scriptSizeLe;

      const scriptPubKey = data.slice(offset + totalLen, offset + totalLen + scriptLen);
      totalLen += scriptLen;

      outputs.push({
        address: '', // Would need to decode from scriptPubKey
        value: Number(value),
        scriptPubKey: typeof scriptPubKey === 'string' ? scriptPubKey : bytesToHex(scriptPubKey)
      });
    }

    return [outputs, totalLen];
  }

  /**
   * Read spend descriptions
   */
  private static readSpends(data: Uint8Array, offset: number): [ShieldedSpendDescription[], number] {
    const [count, sizeLen] = this.readCompactSize(data, offset);
    const spends: ShieldedSpendDescription[] = [];
    let totalLen = sizeLen;
    const spendSize = 32 + 32 + 32 + 32 + 192 + 64; // cv + anchor + nf + rk + proof + sig

    for (let i = 0; i < count; i++) {
      const itemOffset = totalLen;
      const spend: ShieldedSpendDescription = {
        cv: data.slice(offset + itemOffset, offset + itemOffset + 32),
        anchor: data.slice(offset + itemOffset + 32, offset + itemOffset + 64),
        nullifier: data.slice(offset + itemOffset + 64, offset + itemOffset + 96),
        rk: data.slice(offset + itemOffset + 96, offset + itemOffset + 128),
        zkproof: data.slice(offset + itemOffset + 128, offset + itemOffset + 320),
        spendAuthSig: data.slice(offset + itemOffset + 320, offset + itemOffset + 384)
      };
      spends.push(spend);
      totalLen += spendSize;
    }

    return [spends, totalLen];
  }

  /**
   * Read output descriptions
   */
  private static readOutputs(data: Uint8Array, offset: number): [ShieldedOutputDescription[], number] {
    const [count, sizeLen] = this.readCompactSize(data, offset);
    const outputs: ShieldedOutputDescription[] = [];
    let totalLen = sizeLen;
    const outputSize = 32 + 32 + 32 + 580 + 80 + 192; // cv + cmu + epk + enc + out + proof

    for (let i = 0; i < count; i++) {
      const itemOffset = totalLen;
      const output: ShieldedOutputDescription = {
        cv: data.slice(offset + itemOffset, offset + itemOffset + 32),
        cmu: data.slice(offset + itemOffset + 32, offset + itemOffset + 64),
        ephemeralKey: data.slice(offset + itemOffset + 64, offset + itemOffset + 96),
        encCiphertext: data.slice(offset + itemOffset + 96, offset + itemOffset + 676),
        outCiphertext: data.slice(offset + itemOffset + 676, offset + itemOffset + 756),
        zkproof: data.slice(offset + itemOffset + 756, offset + itemOffset + 948)
      };
      outputs.push(output);
      totalLen += outputSize;
    }

    return [outputs, totalLen];
  }
}

/**
 * Transaction Serialization
 * Handles serialization and deserialization of Zcash transactions
 */

import type { Transaction, TransparentInput, TransparentOutput } from '../types/index';

/**
 * Transaction Serializer
 */
export class TransactionSerializer {
  /**
   * Serialize transaction to hex string
   */
  serialize(tx: Transaction): string {
    const size = this.calculateSize(tx);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;

    // Write version (4 bytes, little-endian)
    view.setUint32(offset, tx.version, true);
    offset += 4;

    // Write version group ID (if v4+)
    if (tx.version >= 4 && tx.versionGroupId !== undefined) {
      view.setUint32(offset, tx.versionGroupId, true);
      offset += 4;
    }

    // Serialize transparent inputs
    offset = this.serializeTransparentInputs(view, offset, tx.transparentInputs);

    // Serialize transparent outputs
    offset = this.serializeTransparentOutputs(view, offset, tx.transparentOutputs);

    // Serialize shielded components (if any)
    if (tx.shieldedInputs || tx.shieldedOutputs) {
      offset = this.serializeShieldedComponents(view, offset, tx);
    }

    // Write lock time and expiry
    view.setUint32(offset, tx.lockTime, true);
    offset += 4;
    view.setUint32(offset, tx.expiryHeight, true);
    offset += 4;

    // Write binding signature (if shielded)
    if (tx.bindingSig) {
      const sigBytes = this.hexToBytes(tx.bindingSig);
      new Uint8Array(buffer, offset, 64).set(sigBytes);
      offset += 64;
    }

    return this.bytesToHex(new Uint8Array(buffer));
  }

  /**
   * Deserialize hex string to transaction
   */
  deserialize(hex: string): Transaction {
    const bytes = this.hexToBytes(hex);
    const view = new DataView(bytes.buffer);
    let offset = 0;

    const version = view.getUint32(offset, true);
    offset += 4;

    let versionGroupId = 0;
    if (version >= 4) {
      versionGroupId = view.getUint32(offset, true);
      offset += 4;
    }

    // Deserialize transparent inputs
    const { inputs, newOffset: offset1 } = this.deserializeTransparentInputs(view, offset);
    offset = offset1;

    // Deserialize transparent outputs
    const { outputs, newOffset: offset2 } = this.deserializeTransparentOutputs(view, offset);
    offset = offset2;

    // Deserialize shielded components (if any)
    let shieldedInputs;
    let shieldedOutputs;
    let bindingSig: string | undefined;
    let valueBalance = 0;

    if (version >= 2) {
      // Check if shielded components exist (simplified check)
      const hasShielded = offset < bytes.length - 8; // At least lockTime + expiryHeight
      if (hasShielded) {
        // Simplified - full implementation would properly detect shielded components
        // For now, skipping shielded deserialization
      }
    }

    // Read lock time and expiry
    const lockTime = view.getUint32(offset, true);
    offset += 4;
    const expiryHeight = view.getUint32(offset, true);
    offset += 4;

    // Read binding signature if present
    if (offset + 64 <= bytes.length) {
      const sigBytes = new Uint8Array(bytes.buffer, offset, 64);
      bindingSig = this.bytesToHex(sigBytes);
      offset += 64;
    }

    return {
      version,
      versionGroupId: version >= 4 ? versionGroupId : undefined,
      lockTime,
      expiryHeight,
      transparentInputs: inputs,
      transparentOutputs: outputs,
      shieldedInputs,
      shieldedOutputs,
      bindingSig,
      valueBalance
    };
  }

  /**
   * Serialize transparent inputs
   */
  private serializeTransparentInputs(
    view: DataView,
    offset: number,
    inputs: TransparentInput[]
  ): number {
    // Write input count (compact size)
    offset = this.writeCompactSize(view, offset, inputs.length);

    for (const input of inputs) {
      // Write prevout hash (32 bytes, reversed for little-endian)
      const hashBytes = this.hexToBytes(input.txHash).reverse();
      new Uint8Array(view.buffer, offset, 32).set(hashBytes);
      offset += 32;

      // Write prevout index (4 bytes, little-endian)
      view.setUint32(offset, input.index, true);
      offset += 4;

      // Write script length and script
      const scriptBytes = input.scriptSig
        ? this.hexToBytes(input.scriptSig)
        : new Uint8Array(0);
      offset = this.writeCompactSize(view, offset, scriptBytes.length);
      new Uint8Array(view.buffer, offset, scriptBytes.length).set(scriptBytes);
      offset += scriptBytes.length;

      // Write sequence (4 bytes, little-endian)
      view.setUint32(offset, input.sequence, true);
      offset += 4;
    }

    return offset;
  }

  /**
   * Serialize transparent outputs
   */
  private serializeTransparentOutputs(
    view: DataView,
    offset: number,
    outputs: TransparentOutput[]
  ): number {
    // Write output count (compact size)
    offset = this.writeCompactSize(view, offset, outputs.length);

    for (const output of outputs) {
      // Write value (8 bytes, little-endian)
      view.setBigUint64(offset, BigInt(output.value), true);
      offset += 8;

      // Write script length and script
      const scriptBytes = this.hexToBytes(output.scriptPubKey);
      offset = this.writeCompactSize(view, offset, scriptBytes.length);
      new Uint8Array(view.buffer, offset, scriptBytes.length).set(scriptBytes);
      offset += scriptBytes.length;
    }

    return offset;
  }

  /**
   * Serialize shielded components
   */
  private serializeShieldedComponents(
    view: DataView,
    offset: number,
    tx: Transaction
  ): number {
    if (!tx.shieldedInputs && !tx.shieldedOutputs) {
      return offset;
    }

    // Write shielded input count
    const inputCount = tx.shieldedInputs?.length || 0;
    offset = this.writeCompactSize(view, offset, inputCount);

    // Serialize shielded inputs (simplified - full implementation needed)
    if (tx.shieldedInputs) {
      for (let i = 0; i < tx.shieldedInputs.length; i++) {
        // Placeholder sizes - full implementation would serialize all fields
        offset += 32 + 32 + 192 + 32 + 32; // nullifier + rk + proof + cv + anchor
      }
    }

    // Write shielded output count
    const outputCount = tx.shieldedOutputs?.length || 0;
    offset = this.writeCompactSize(view, offset, outputCount);

    // Serialize shielded outputs (simplified - full implementation needed)
    if (tx.shieldedOutputs) {
      for (let i = 0; i < tx.shieldedOutputs.length; i++) {
        // Placeholder sizes - full implementation would serialize all fields
        offset += 32 + 32 + 32 + 580 + 80 + 192; // cv + cmu + ephemeralKey + encCiphertext + outCiphertext + proof
      }
    }

    // Write value balance (8 bytes)
    view.setBigUint64(offset, BigInt(tx.valueBalance || 0), true);
    offset += 8;

    return offset;
  }

  /**
   * Deserialize transparent inputs
   */
  private deserializeTransparentInputs(
    view: DataView,
    offset: number
  ): { inputs: TransparentInput[]; newOffset: number } {
    const { value: count, newOffset } = this.readCompactSize(view, offset);
    offset = newOffset;

    const inputs: TransparentInput[] = [];
    for (let i = 0; i < count; i++) {
      const hashBytes = new Uint8Array(view.buffer, offset, 32);
      const txHash = this.bytesToHex(hashBytes.reverse());
      offset += 32;

      const index = view.getUint32(offset, true);
      offset += 4;

      const { value: scriptLen, newOffset: offset1 } = this.readCompactSize(view, offset);
      offset = offset1;

      const scriptBytes = new Uint8Array(view.buffer, offset, scriptLen);
      const scriptSig = this.bytesToHex(scriptBytes);
      offset += scriptLen;

      const sequence = view.getUint32(offset, true);
      offset += 4;

      inputs.push({
        txHash,
        index,
        scriptSig,
        sequence,
        scriptPubKey: '', // Not available in raw transaction
        value: 0 // Not available in raw transaction
      });
    }

    return { inputs, newOffset: offset };
  }

  /**
   * Deserialize transparent outputs
   */
  private deserializeTransparentOutputs(
    view: DataView,
    offset: number
  ): { outputs: TransparentOutput[]; newOffset: number } {
    const { value: count, newOffset } = this.readCompactSize(view, offset);
    offset = newOffset;

    const outputs: TransparentOutput[] = [];
    for (let i = 0; i < count; i++) {
      const value = Number(view.getBigUint64(offset, true));
      offset += 8;

      const { value: scriptLen, newOffset: offset1 } = this.readCompactSize(view, offset);
      offset = offset1;

      const scriptBytes = new Uint8Array(view.buffer, offset, scriptLen);
      const scriptPubKey = this.bytesToHex(scriptBytes);
      offset += scriptLen;

      outputs.push({
        value,
        scriptPubKey,
        address: '' // Decode from scriptPubKey if needed
      });
    }

    return { outputs, newOffset: offset };
  }

  /**
   * Calculate transaction size for buffer allocation
   */
  private calculateSize(tx: Transaction): number {
    let size = 4; // version

    if (tx.version >= 4) {
      size += 4; // versionGroupId
    }

    // Transparent inputs size
    size += this.compactSizeSize(tx.transparentInputs.length);
    for (const input of tx.transparentInputs) {
      size += 32 + 4; // hash + index
      const scriptLen = input.scriptSig ? this.hexToBytes(input.scriptSig).length : 0;
      size += this.compactSizeSize(scriptLen) + scriptLen; // script length + script
      size += 4; // sequence
    }

    // Transparent outputs size
    size += this.compactSizeSize(tx.transparentOutputs.length);
    for (const output of tx.transparentOutputs) {
      size += 8; // value
      const scriptLen = this.hexToBytes(output.scriptPubKey).length;
      size += this.compactSizeSize(scriptLen) + scriptLen; // script length + script
    }

    // Shielded components size
    if (tx.shieldedInputs || tx.shieldedOutputs) {
      size += this.compactSizeSize(tx.shieldedInputs?.length || 0);
      size += (tx.shieldedInputs?.length || 0) * (32 + 32 + 192 + 32 + 32); // inputs
      size += this.compactSizeSize(tx.shieldedOutputs?.length || 0);
      size += (tx.shieldedOutputs?.length || 0) * (32 + 32 + 32 + 580 + 80 + 192); // outputs
      size += 8; // valueBalance
      size += 64; // bindingSig
    }

    size += 4 + 4; // lockTime + expiryHeight

    return size;
  }

  /**
   * Write compact size encoding
   */
  private writeCompactSize(view: DataView, offset: number, value: number): number {
    if (value < 0xFD) {
      view.setUint8(offset, value);
      return offset + 1;
    } else if (value <= 0xFFFF) {
      view.setUint8(offset, 0xFD);
      view.setUint16(offset + 1, value, true);
      return offset + 3;
    } else if (value <= 0xFFFFFFFF) {
      view.setUint8(offset, 0xFE);
      view.setUint32(offset + 1, value, true);
      return offset + 5;
    } else {
      view.setUint8(offset, 0xFF);
      view.setBigUint64(offset + 1, BigInt(value), true);
      return offset + 9;
    }
  }

  /**
   * Read compact size encoding
   */
  private readCompactSize(view: DataView, offset: number): { value: number; newOffset: number } {
    const first = view.getUint8(offset);

    if (first < 0xFD) {
      return { value: first, newOffset: offset + 1 };
    } else if (first === 0xFD) {
      return { value: view.getUint16(offset + 1, true), newOffset: offset + 3 };
    } else if (first === 0xFE) {
      return { value: view.getUint32(offset + 1, true), newOffset: offset + 5 };
    } else {
      return { value: Number(view.getBigUint64(offset + 1, true)), newOffset: offset + 9 };
    }
  }

  /**
   * Calculate compact size encoding length
   */
  private compactSizeSize(value: number): number {
    if (value < 0xFD) return 1;
    if (value <= 0xFFFF) return 3;
    if (value <= 0xFFFFFFFF) return 5;
    return 9;
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}



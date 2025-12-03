/**
 * Shielded Transaction Signer
 * Signs shielded transactions with spending key and proofs
 */

import type {
  ShieldedSpendDescription,
  ShieldedBundle,
  ShieldedOutputDescription
} from './types.js';
import type {
  UnsignedShieldedTransaction,
  ShieldedSigningData
} from './transactionBuilder.js';
import type { SignedTransaction } from '../types/index';
import { ZcashProver } from './prover.js';
import { blake2s } from '@noble/hashes/blake2s';
import { concatBytes, bytesToHex } from '../utils/bytes';
import { signSpendAuth } from './redJubjub.js';
import { addScalars } from './scalarArithmetic.js';

/**
 * Signed shielded transaction
 */
export interface SignedShieldedTransaction extends SignedTransaction {
  /** Shielded bundle with proofs and signatures */
  shieldedBundle: ShieldedBundle;
  
  /** Nullifiers revealed by this transaction */
  nullifiers: Uint8Array[];
}

/**
 * Shielded Transaction Signer
 */
export class ShieldedSigner {
  private prover: ZcashProver;

  constructor(prover?: ZcashProver) {
    this.prover = prover || new ZcashProver();
  }

  /**
   * Sign a shielded transaction
   */
  async signShieldedTransaction(
    tx: UnsignedShieldedTransaction
  ): Promise<SignedShieldedTransaction> {
    // Generate proofs
    const proofs = await this.prover.generateProofs(tx);

    // Apply proofs to spend descriptions
    const signedSpends = this.applySpendProofs(
      tx.shieldedBundle.spends,
      proofs.spendProofs,
      tx.signingData
    );

    // Apply proofs to output descriptions
    const signedOutputs = tx.shieldedBundle.outputs.map((output: ShieldedOutputDescription, i: number) => ({
      ...output,
      zkproof: proofs.outputProofs[i].proof
    }));

    // Create signed bundle
    const signedBundle: ShieldedBundle = {
      spends: signedSpends,
      outputs: signedOutputs,
      valueBalance: tx.shieldedBundle.valueBalance,
      bindingSig: proofs.bindingSig
    };

    // Extract nullifiers
    const nullifiers = signedSpends.map(spend => spend.nullifier);

    // Serialize transaction
    const rawTx = this.serializeTransaction(tx, signedBundle);
    const txHash = this.computeTxHash(rawTx);

    return {
      tx: {
        version: tx.version,
        versionGroupId: tx.versionGroupId,
        transparentInputs: tx.transparentInputs,
        transparentOutputs: tx.transparentOutputs,
        lockTime: tx.lockTime,
        expiryHeight: tx.expiryHeight,
        valueBalance: Number(tx.shieldedBundle.valueBalance)
      },
      txHash,
      rawTx,
      shieldedBundle: signedBundle,
      nullifiers
    };
  }

  /**
   * Apply proofs and generate spend auth signatures
   */
  private applySpendProofs(
    spends: ShieldedSpendDescription[],
    proofs: { proof: Uint8Array; cv: Uint8Array; rk?: Uint8Array }[],
    signingData: ShieldedSigningData
  ): ShieldedSpendDescription[] {
    return spends.map((spend, i) => {
      const proof = proofs[i];
      const spendData = signingData.spends[i];

      // Generate spend authorization signature
      const spendAuthSig = this.generateSpendAuthSignature(
        spendData.spendingKey.ask,
        spendData.alpha,
        spend.rk,
        this.computeSpendSighash(spend, signingData.valueBalance)
      );

      return {
        ...spend,
        cv: proof.cv,
        rk: proof.rk || spend.rk,
        zkproof: proof.proof,
        spendAuthSig
      };
    });
  }

  /**
   * Generate spend authorization signature
   * Uses RedJubjub signature scheme with randomized spending key
   */
  private generateSpendAuthSignature(
    ask: Uint8Array,
    alpha: Uint8Array,
    _rk: Uint8Array,
    sighash: Uint8Array
  ): Uint8Array {
    // Spend authorization signature uses a randomized spending key
    // The private key is: (ask + alpha) mod order
    const randomizedKey = addScalars(ask, alpha);

    // Sign the sighash with the randomized key
    const sig = signSpendAuth(randomizedKey, sighash);

    // Concatenate R || s to get 64-byte signature
    return concatBytes(sig.r, sig.s);
  }

  /**
   * Compute sighash for spend authorization
   */
  private computeSpendSighash(
    spend: ShieldedSpendDescription,
    valueBalance: bigint
  ): Uint8Array {
    // Placeholder sighash
    // Real implementation follows Zcash's signature hash algorithm
    const input = concatBytes(
      spend.cv,
      spend.anchor,
      spend.nullifier,
      spend.rk,
      this.bigintToBytes(valueBalance, 8)
    );
    return blake2s(input, { dkLen: 32 });
  }

  /**
   * Serialize full transaction
   */
  private serializeTransaction(
    tx: UnsignedShieldedTransaction,
    bundle: ShieldedBundle
  ): string {
    // Placeholder serialization
    // Real implementation follows Zcash transaction format
    
    const parts: Uint8Array[] = [];
    
    // Version
    parts.push(this.uint32ToBytes(tx.version));
    
    // Version group ID
    parts.push(this.uint32ToBytes(tx.versionGroupId));
    
    // Transparent inputs count and inputs
    parts.push(this.compactSize(tx.transparentInputs.length));
    // ... serialize transparent inputs
    
    // Transparent outputs count and outputs
    parts.push(this.compactSize(tx.transparentOutputs.length));
    // ... serialize transparent outputs
    
    // Lock time
    parts.push(this.uint32ToBytes(tx.lockTime));
    
    // Expiry height
    parts.push(this.uint32ToBytes(tx.expiryHeight));
    
    // Value balance
    parts.push(this.bigintToBytes(bundle.valueBalance, 8));
    
    // Shielded spends
    parts.push(this.compactSize(bundle.spends.length));
    for (const spend of bundle.spends) {
      parts.push(spend.cv);
      parts.push(spend.anchor);
      parts.push(spend.nullifier);
      parts.push(spend.rk);
      parts.push(spend.zkproof);
      parts.push(spend.spendAuthSig);
    }
    
    // Shielded outputs
    parts.push(this.compactSize(bundle.outputs.length));
    for (const output of bundle.outputs) {
      parts.push(output.cv);
      parts.push(output.cmu);
      parts.push(output.ephemeralKey);
      parts.push(output.encCiphertext);
      parts.push(output.outCiphertext);
      parts.push(output.zkproof);
    }
    
    // Binding signature
    parts.push(bundle.bindingSig);
    
    // Concatenate all parts
    const serialized = concatBytes(...parts);
    return bytesToHex(serialized);
  }

  /**
   * Compute transaction hash
   */
  private computeTxHash(rawTx: string): string {
    const bytes = this.hexToBytes(rawTx);
    const hash = blake2s(bytes, { dkLen: 32 });
    // Reverse for display (little-endian)
    return bytesToHex(new Uint8Array(hash).reverse());
  }

  // Helper methods

  private uint32ToBytes(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, value, true);
    return bytes;
  }

  private bigintToBytes(value: bigint, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let v = value >= 0n ? value : -value;
    for (let i = 0; i < length; i++) {
      bytes[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    return bytes;
  }

  private compactSize(value: number): Uint8Array {
    if (value < 0xFD) {
      return new Uint8Array([value]);
    } else if (value <= 0xFFFF) {
      const bytes = new Uint8Array(3);
      bytes[0] = 0xFD;
      new DataView(bytes.buffer).setUint16(1, value, true);
      return bytes;
    } else {
      const bytes = new Uint8Array(5);
      bytes[0] = 0xFE;
      new DataView(bytes.buffer).setUint32(1, value, true);
      return bytes;
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}

/**
 * Verify a signed shielded transaction
 */
export class ShieldedVerifier {
  private prover: ZcashProver;

  constructor(prover?: ZcashProver) {
    this.prover = prover || new ZcashProver();
  }

  /**
   * Verify all proofs in a transaction
   */
  async verifyTransaction(tx: SignedShieldedTransaction): Promise<boolean> {
    // Verify spend proofs
    for (const spend of tx.shieldedBundle.spends) {
      const valid = await this.prover.verifySpendProof(
        { proof: spend.zkproof, cv: spend.cv, rk: spend.rk },
        spend.cv,
        spend.anchor,
        spend.nullifier,
        spend.rk
      );
      if (!valid) {
        return false;
      }
    }

    // Verify output proofs
    for (const output of tx.shieldedBundle.outputs) {
      const valid = await this.prover.verifyOutputProof(
        { proof: output.zkproof, cv: output.cv, cmu: output.cmu },
        output.cv,
        output.cmu,
        output.ephemeralKey
      );
      if (!valid) {
        return false;
      }
    }

    // Verify binding signature
    // (Placeholder - real implementation would verify RedJubjub signature)

    // Verify value balance
    // (Placeholder - real implementation would verify cv commitments sum)

    return true;
  }

  /**
   * Verify spend authorization signatures
   */
  verifySpendAuthSignatures(tx: SignedShieldedTransaction): boolean {
    // Placeholder verification
    for (const spend of tx.shieldedBundle.spends) {
      if (spend.spendAuthSig.length !== 64) {
        return false;
      }
    }
    return true;
  }
}


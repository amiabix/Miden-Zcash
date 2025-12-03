/**
 * Transaction Signing
 * Handles signing of Zcash transactions
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import type {
  Transaction,
  TransparentInput,
  SignedTransaction
} from '../types/index';
import { TransactionSerializer } from './serialization';

/**
 * Transaction Signer
 */
export class ZcashSigner {
  private serializer: TransactionSerializer;

  constructor() {
    this.serializer = new TransactionSerializer();
  }

  /**
   * Sign transparent transaction
   */
  signTransparentTransaction(
    tx: Transaction,
    privateKey: Uint8Array,
    inputs: TransparentInput[]
  ): SignedTransaction {
    // Create a copy of the transaction for signing
    const txCopy = { ...tx };

    // Sign each input
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const signature = this.signInput(txCopy, i, privateKey, input.scriptPubKey);
      
      // Add signature to input
      txCopy.transparentInputs[i] = {
        ...txCopy.transparentInputs[i],
        scriptSig: this.createScriptSig(signature, privateKey)
      };
    }

    // Serialize transaction
    const rawTx = this.serializer.serialize(txCopy);

    // Calculate transaction hash
    const txHash = this.calculateTxHash(rawTx);

    return {
      tx: txCopy,
      txHash,
      rawTx
    };
  }

  /**
   * Sign a single input
   */
  private signInput(
    tx: Transaction,
    inputIndex: number,
    privateKey: Uint8Array,
    scriptPubKey: string
  ): Uint8Array {
    // Create signature hash
    const hash = this.createSignatureHash(tx, inputIndex, scriptPubKey);

    // Sign with ECDSA using @noble/curves
    const signature = secp256k1.sign(hash, privateKey);

    // Encode signature (DER format)
    return signature.toDERRawBytes();
  }

  /**
   * Create signature hash for input
   * This implements Zcash's signature hash algorithm
   */
  private createSignatureHash(
    tx: Transaction,
    inputIndex: number,
    scriptPubKey: string
  ): Uint8Array {
    // Zcash uses a modified version of Bitcoin's signature hash
    // For now, using a simplified version
    // Full implementation would follow Zcash's exact specification

    // Serialize transaction with this input's script replaced
    const txCopy = { ...tx };
    
    // Replace all scripts with scriptPubKey for this input, empty for others
    txCopy.transparentInputs = txCopy.transparentInputs.map((input, i) => ({
      ...input,
      scriptSig: i === inputIndex ? scriptPubKey : ''
    }));

    // Serialize
    const serialized = this.serializer.serialize(txCopy);

    // Hash
    return sha256(sha256(this.hexToBytes(serialized)));
  }

  /**
   * Create script signature (scriptSig)
   */
  private createScriptSig(signature: Uint8Array, privateKey: Uint8Array): string {
    // Get public key from private key
    const publicKey = secp256k1.getPublicKey(privateKey);

    // Create script: <signature> <publicKey>
    const signatureHex = this.bytesToHex(signature);
    const publicKeyHex = this.bytesToHex(publicKey);

    // Push signature (with SIGHASH_ALL)
    const sigWithHash = signatureHex + '01'; // 01 = SIGHASH_ALL

    // Push public key
    // Script format: [signature length][signature][publicKey length][publicKey]
    const sigLength = (sigWithHash.length / 2).toString(16).padStart(2, '0');
    const pubKeyLength = (publicKeyHex.length / 2).toString(16).padStart(2, '0');

    return sigLength + sigWithHash + pubKeyLength + publicKeyHex;
  }

  /**
   * Calculate transaction hash
   */
  private calculateTxHash(rawTx: string): string {
    const bytes = this.hexToBytes(rawTx);
    const hash = sha256(sha256(bytes));
    return this.bytesToHex(new Uint8Array(hash).reverse()); // Reverse for little-endian
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

/**
 * Transaction Signing Tests
 * Tests ECDSA signing for transparent transactions
 */

import { ZcashSigner } from '../../src/transactions/signing';
import type { Transaction, TransparentInput } from '../../src/types';

describe('ZcashSigner', () => {
  let signer: ZcashSigner;

  beforeEach(() => {
    signer = new ZcashSigner();
  });

  describe('signTransparentTransaction', () => {
    it('should sign a transparent transaction', () => {
      const privateKey = new Uint8Array(32);
      // Generate a valid secp256k1 private key (not all zeros)
      crypto.getRandomValues(privateKey);

      const tx: Transaction = {
        version: 4,
        versionGroupId: 0x892F2085,
        lockTime: 0,
        expiryHeight: 1000020,
        transparentInputs: [
          {
            txHash: 'abc123',
            index: 0,
            scriptPubKey: '76a914...',
            value: 50000000,
            sequence: 0xFFFFFFFF
          }
        ],
        transparentOutputs: [
          {
            address: 'tmRecipient',
            value: 10000000,
            scriptPubKey: ''
          }
        ],
        valueBalance: 0
      };

      const inputs: TransparentInput[] = [
        {
          txHash: 'abc123',
          index: 0,
          scriptPubKey: '76a914...',
          value: 50000000,
          sequence: 0xFFFFFFFF
        }
      ];

      const signed = signer.signTransparentTransaction(tx, privateKey, inputs);

      expect(signed).toBeDefined();
      expect(signed.txHash).toBeDefined();
      expect(signed.rawTx).toBeDefined();
      expect(signed.tx.transparentInputs[0].scriptSig).toBeDefined();
    });

    it('should produce different signatures for different transactions', () => {
      const privateKey = new Uint8Array(32);
      crypto.getRandomValues(privateKey);

      const tx1: Transaction = {
        version: 4,
        versionGroupId: 0x892F2085,
        lockTime: 0,
        expiryHeight: 1000020,
        transparentInputs: [
          {
            txHash: 'abc123',
            index: 0,
            scriptPubKey: '76a914...',
            value: 50000000,
            sequence: 0xFFFFFFFF
          }
        ],
        transparentOutputs: [
          {
            address: 'tmRecipient1',
            value: 10000000,
            scriptPubKey: ''
          }
        ],
        valueBalance: 0
      };

      const tx2: Transaction = {
        ...tx1,
        transparentOutputs: [
          {
            address: 'tmRecipient2',
            value: 20000000,
            scriptPubKey: ''
          }
        ]
      };

      const inputs: TransparentInput[] = [
        {
          txHash: 'abc123',
          index: 0,
          scriptPubKey: '76a914...',
          value: 50000000,
          sequence: 0xFFFFFFFF
        }
      ];

      const signed1 = signer.signTransparentTransaction(tx1, privateKey, inputs);
      const signed2 = signer.signTransparentTransaction(tx2, privateKey, inputs);

      expect(signed1.txHash).not.toBe(signed2.txHash);
    });
  });
});



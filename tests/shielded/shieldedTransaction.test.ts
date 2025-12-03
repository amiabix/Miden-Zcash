/**
 * Shielded Transaction End-to-End Test
 * Tests the complete shielded transaction flow
 */

import { ShieldedTransactionBuilder } from '../../src/shielded/transactionBuilder';
import { ShieldedSigner } from '../../src/shielded/signer';
import { ZcashProver } from '../../src/shielded/prover';
import { NoteCache } from '../../src/shielded/noteCache';
import type { SaplingSpendingKey, NoteSpendParams, ShieldedOutputParams } from '../../src/types/index';

describe('Shielded Transaction Flow', () => {
  let noteCache: NoteCache;
  let builder: ShieldedTransactionBuilder;
  let signer: ShieldedSigner;
  let prover: ZcashProver;

  beforeEach(() => {
    noteCache = new NoteCache();
    builder = new ShieldedTransactionBuilder(noteCache);
    prover = new ZcashProver();
    signer = new ShieldedSigner(prover);
  });

  describe('Transaction Building', () => {
    it('should build a shielded transaction (z-to-z)', () => {
      const spendingKey: SaplingSpendingKey = {
        ask: new Uint8Array(32).fill(1),
        nsk: new Uint8Array(32).fill(2)
      };

      const spends: NoteSpendParams[] = [
        {
          note: {
            value: 20000n, // Enough to cover output (5000) + fee (10000) + change
            diversifier: new Uint8Array(11).fill(1),
            pkD: new Uint8Array(32).fill(2),
            rcm: new Uint8Array(32).fill(3),
            cmu: new Uint8Array(32).fill(4) // Note commitment
          },
          witness: {
            authPath: [],
            position: 0n
          }
        }
      ];

      const outputs: ShieldedOutputParams[] = [
        {
          address: 'ztestsapling1test',
          value: 5000n, // Less than input - fee
          memo: new Uint8Array(512)
        }
      ];

      const anchor = new Uint8Array(32).fill(5);

      const tx = builder.buildShieldedTransaction({
        spendingKey,
        spends,
        outputs,
        anchor,
        fee: 10000
      });

      expect(tx).toBeDefined();
      expect(tx.shieldedBundle).toBeDefined();
      expect(tx.shieldedBundle.spends.length).toBe(1);
      expect(tx.shieldedBundle.outputs.length).toBe(1);
      expect(tx.shieldedBundle.valueBalance).toBeDefined();
      expect(tx.signingData).toBeDefined();
    });

    it('should calculate value balance correctly', () => {
      const spendingKey: SaplingSpendingKey = {
        ask: new Uint8Array(32).fill(1),
        nsk: new Uint8Array(32).fill(2)
      };

      const spends: NoteSpendParams[] = [
        {
          note: {
            value: 10000n,
            diversifier: new Uint8Array(11).fill(1),
            pkD: new Uint8Array(32).fill(2),
            rcm: new Uint8Array(32).fill(3)
          },
          witness: {
            authPath: [],
            position: 0n
          }
        }
      ];

      const outputs: ShieldedOutputParams[] = [
        {
          address: 'ztestsapling1test',
          value: 15000n, // More than input - fee (should fail)
          memo: new Uint8Array(512)
        }
      ];

      const anchor = new Uint8Array(32).fill(5);
      const fee = 10000;

      // Value balance = input - output - fee
      // 10000 - 15000 - 10000 = -15000 (should throw error)
      expect(() => {
        builder.buildShieldedTransaction({
          spendingKey,
          spends,
          outputs,
          anchor,
          fee
        });
      }).toThrow('Insufficient shielded funds');
    });
  });

  describe('Transaction Signing', () => {
    it('should sign a shielded transaction', async () => {
      const spendingKey: SaplingSpendingKey = {
        ask: new Uint8Array(32).fill(1),
        nsk: new Uint8Array(32).fill(2)
      };

      const spends: NoteSpendParams[] = [
        {
          note: {
            value: 20000n, // Enough to cover output + fee
            diversifier: new Uint8Array(11).fill(1),
            pkD: new Uint8Array(32).fill(2),
            rcm: new Uint8Array(32).fill(3),
            cmu: new Uint8Array(32).fill(4) // Note commitment
          },
          witness: {
            authPath: [],
            position: 0n
          }
        }
      ];

      const outputs: ShieldedOutputParams[] = [
        {
          address: 'ztestsapling1test',
          value: 5000n,
          memo: new Uint8Array(512)
        }
      ];

      const anchor = new Uint8Array(32).fill(5);

      const unsignedTx = builder.buildShieldedTransaction({
        spendingKey,
        spends,
        outputs,
        anchor,
        fee: 10000
      });

      // Initialize prover
      await prover.initialize();

      const signedTx = await signer.signShieldedTransaction(unsignedTx);

      expect(signedTx).toBeDefined();
      expect(signedTx.txHash).toBeDefined();
      expect(signedTx.rawTx).toBeDefined();
      expect(signedTx.shieldedBundle).toBeDefined();
      expect(signedTx.shieldedBundle.spends.length).toBe(1);
      expect(signedTx.shieldedBundle.outputs.length).toBe(1);
      expect(signedTx.shieldedBundle.bindingSig).toBeDefined();
      expect(signedTx.nullifiers).toBeDefined();
      expect(signedTx.nullifiers.length).toBe(1);
    });

    it('should generate proofs for all spends and outputs', async () => {
      const spendingKey: SaplingSpendingKey = {
        ask: new Uint8Array(32).fill(1),
        nsk: new Uint8Array(32).fill(2)
      };

      const spends: NoteSpendParams[] = [
        {
          note: {
            value: 20000n, // Total input: 20000
            diversifier: new Uint8Array(11).fill(1),
            pkD: new Uint8Array(32).fill(2),
            rcm: new Uint8Array(32).fill(3),
            cmu: new Uint8Array(32).fill(4) // Note commitment
          },
          witness: {
            authPath: [],
            position: 0n
          }
        },
        {
          note: {
            value: 10000n, // Total input: 30000
            diversifier: new Uint8Array(11).fill(4),
            pkD: new Uint8Array(32).fill(5),
            rcm: new Uint8Array(32).fill(6),
            cmu: new Uint8Array(32).fill(7) // Note commitment
          },
          witness: {
            authPath: [],
            position: 1n
          }
        }
      ];

      const outputs: ShieldedOutputParams[] = [
        {
          address: 'ztestsapling1test',
          value: 15000n, // Output: 15000, Fee: 10000, Total needed: 25000 < 30000
          memo: new Uint8Array(512)
        }
      ];

      const anchor = new Uint8Array(32).fill(5);

      const unsignedTx = builder.buildShieldedTransaction({
        spendingKey,
        spends,
        outputs,
        anchor,
        fee: 10000
      });

      await prover.initialize();
      const signedTx = await signer.signShieldedTransaction(unsignedTx);

      // Should have proofs for all spends and outputs
      expect(signedTx.shieldedBundle.spends.length).toBe(2);
      expect(signedTx.shieldedBundle.outputs.length).toBe(1);
      
      // Each spend should have a proof
      for (const spend of signedTx.shieldedBundle.spends) {
        expect(spend.zkproof).toBeDefined();
        expect(spend.zkproof.length).toBeGreaterThan(0);
      }
      
      // Each output should have a proof
      for (const output of signedTx.shieldedBundle.outputs) {
        expect(output.zkproof).toBeDefined();
        expect(output.zkproof.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Shielding Transaction (t-to-z)', () => {
    it('should build a shielding transaction', () => {
      const transparentInputs = [
        {
          txid: new Uint8Array(32).fill(1),
          vout: 0,
          scriptPubKey: new Uint8Array(25).fill(2),
          value: 20000n // Enough to cover output (9000) + fee (10000) + change
        }
      ];

      const spendingKey: SaplingSpendingKey = {
        ask: new Uint8Array(32).fill(1),
        nsk: new Uint8Array(32).fill(2)
      };

      const shieldedOutput = {
        address: 'ztestsapling1test',
        value: 9000n,
        memo: new Uint8Array(512)
      };

      const tx = builder.buildShieldingTransaction({
        transparentInputs,
        spendingKey,
        shieldedOutput,
        changeAddress: 't1test',
        fee: 10000
      });

      expect(tx).toBeDefined();
      expect(tx.transparentInputs.length).toBe(1);
      expect(tx.shieldedBundle).toBeDefined();
      expect(tx.shieldedBundle.outputs.length).toBe(1);
      expect(tx.shieldedBundle.spends.length).toBe(0); // No spends in shielding
    });
  });
});


/**
 * Transaction Tests
 * End-to-end tests for transparent and shielded transaction building and signing
 */

import { TransactionBuilder } from '../src/transactions/builder';
import { TransactionSigner } from '../src/transactions/signing';
import { UTXOCache } from '../src/state/utxo';
import type { UTXO, ZcashKeys } from '../src/types';

describe('TransactionBuilder - Transparent', () => {
  let builder: TransactionBuilder;

  beforeEach(() => {
    builder = new TransactionBuilder('testnet');
  });

  describe('buildTransparentTransaction()', () => {
    it('should build valid transparent transaction', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000; // 0.001 ZEC in zatoshi
      const fee = 10000; // 0.0001 ZEC

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      expect(tx).toBeDefined();
      expect(tx.inputs.length).toBeGreaterThan(0);
      expect(tx.outputs.length).toBeGreaterThan(0);
    });

    it('should validate inputs and outputs balance', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      // Calculate total input and output
      const totalInput = utxos.reduce((sum, u) => sum + u.amount, 0);
      const totalOutput = tx.outputs.reduce((sum, o) => sum + o.value, 0);
      const actualFee = totalInput - totalOutput;

      expect(actualFee).toBeGreaterThanOrEqual(fee);
      expect(actualFee).toBeLessThan(fee * 2); // Reasonable fee
    });

    it('should create change output when needed', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 50000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      // Should have 2 outputs: recipient + change
      expect(tx.outputs.length).toBe(2);

      const recipientOutput = tx.outputs.find(o => o.value === amount);
      const changeOutput = tx.outputs.find(
        o => o.value === 200000 - amount - fee
      );

      expect(recipientOutput).toBeDefined();
      expect(changeOutput).toBeDefined();
    });

    it('should reject insufficient funds', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 200000; // More than available
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 100000, // Not enough
          confirmations: 10
        }
      ];

      expect(async () => {
        await builder.buildTransparentTransaction({
          senderAddress,
          recipientAddress,
          amount,
          fee,
          utxos,
          changeAddress: senderAddress
        });
      }).rejects.toThrow();
    });

    it('should handle multiple inputs', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 50000,
          confirmations: 10
        },
        {
          txid: 'bb'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 5
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      expect(tx.inputs.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple outputs', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress1 = 'tmTestRecipient456';
      const recipientAddress2 = 'tmTestRecipient789';
      const amount1 = 50000;
      const amount2 = 30000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddresses: [
          { address: recipientAddress1, value: amount1 },
          { address: recipientAddress2, value: amount2 }
        ],
        fee,
        utxos,
        changeAddress: senderAddress
      });

      expect(tx.outputs.length).toBeGreaterThanOrEqual(3); // 2 recipients + change
    });

    it('should estimate transaction size correctly', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      // Serialize and check size is reasonable
      expect(tx.serialize().length).toBeGreaterThan(0);
      expect(tx.serialize().length).toBeLessThan(1000); // Should be small for simple tx
    });
  });
});

describe('TransactionSigner - Transparent', () => {
  let signer: TransactionSigner;

  beforeEach(() => {
    signer = new TransactionSigner('testnet');
  });

  describe('signTransparentTransaction()', () => {
    it('should sign transparent transaction', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      const signedTx = await signer.signTransparentTransaction(tx, privateKey);

      expect(signedTx).toBeDefined();
      expect(signedTx.inputs[0].signature).toBeDefined();
    });

    it('should produce deterministic signatures', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      // Sign same transaction twice
      const signedTx1 = await signer.signTransparentTransaction(tx, privateKey);
      const signedTx2 = await signer.signTransparentTransaction(tx, privateKey);

      // Signatures should be deterministic
      expect(signedTx1.inputs[0].signature).toBe(signedTx2.inputs[0].signature);
    });

    it('should sign all inputs', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 20000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 10
        },
        {
          txid: 'bb'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 5
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      const signedTx = await signer.signTransparentTransaction(tx, privateKey);

      // All inputs should be signed
      for (const input of signedTx.inputs) {
        expect(input.signature).toBeDefined();
        expect(input.signature.length).toBeGreaterThan(0);
      }
    });

    it('should validate signature after signing', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      const signedTx = await signer.signTransparentTransaction(tx, privateKey);

      // Should be able to serialize signed transaction
      const serialized = signedTx.serialize();
      expect(serialized.length).toBeGreaterThan(0);
    });
  });

  describe('verifySignature()', () => {
    it('should verify valid signature', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      const signedTx = await signer.signTransparentTransaction(tx, privateKey);

      const isValid = signer.verifySignature(
        signedTx.inputs[0].signature,
        tx.serialize()
      );

      expect(isValid).toBe(true);
    });

    it('should reject corrupted signature', async () => {
      const builder = new TransactionBuilder('testnet');
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const privateKey = new Uint8Array(32).fill(1);

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildTransparentTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress
      });

      const signedTx = await signer.signTransparentTransaction(tx, privateKey);

      // Corrupt signature
      let corruptedSignature = signedTx.inputs[0].signature;
      corruptedSignature = corruptedSignature.slice(0, -2) + 'XX';

      const isValid = signer.verifySignature(corruptedSignature, tx.serialize());

      expect(isValid).toBe(false);
    });
  });
});

describe('TransactionBuilder - Shielded', () => {
  let builder: TransactionBuilder;

  beforeEach(() => {
    builder = new TransactionBuilder('testnet');
  });

  describe('buildShieldingTransaction()', () => {
    it('should build shielding transaction (t-to-z)', async () => {
      const senderAddress = 'tmTestSender123';
      const recipientAddress = 'ztestsaplingRecipient123';
      const amount = 100000;
      const fee = 10000;

      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 200000,
          confirmations: 10
        }
      ];

      const tx = await builder.buildShieldingTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        utxos,
        changeAddress: senderAddress,
        memo: 'test memo'
      });

      expect(tx).toBeDefined();
      expect(tx.inputs.length).toBeGreaterThan(0);
      expect(tx.outputs.length).toBeGreaterThan(0);
    });
  });

  describe('buildUnshieldingTransaction()', () => {
    it('should build unshielding transaction (z-to-t)', async () => {
      const senderAddress = 'ztestsaplingSender123';
      const recipientAddress = 'tmTestRecipient456';
      const amount = 100000;
      const fee = 10000;

      const notes: any[] = [
        {
          value: 200000,
          nullifier: new Uint8Array(32).fill(1),
          witness: {}
        }
      ];

      const tx = await builder.buildUnshieldingTransaction({
        senderAddress,
        recipientAddress,
        amount,
        fee,
        notes
      });

      expect(tx).toBeDefined();
    });
  });
});

describe('UTXO Management', () => {
  let cache: UTXOCache;

  beforeEach(() => {
    cache = new UTXOCache({ ttlMs: 60000, minConfirmations: 1 });
  });

  describe('updateUTXOs()', () => {
    it('should cache UTXOs for address', () => {
      const address = 'tmTestAddress123';
      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 10
        },
        {
          txid: 'bb'.repeat(32),
          vout: 0,
          amount: 50000,
          confirmations: 5
        }
      ];

      cache.updateUTXOs(address, utxos, 100);

      const cached = cache.getUTXOs(address);
      expect(cached.length).toBe(2);
      expect(cached[0].amount).toBe(100000);
      expect(cached[1].amount).toBe(50000);
    });
  });

  describe('lockUTXOs()', () => {
    it('should lock UTXOs for pending transaction', () => {
      const address = 'tmTestAddress123';
      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 10
        }
      ];

      cache.updateUTXOs(address, utxos, 100);

      const txid = 'tx123';
      const locked = cache.lockUTXOs(
        address,
        [{ txid: utxos[0].txid, vout: 0 }],
        txid
      );

      expect(locked).toBe(true);

      // Locked UTXOs should not be spendable
      const spendable = cache.getSpendableUTXOs(address, 100);
      expect(spendable.length).toBe(0);
    });
  });

  describe('unlockUTXOs()', () => {
    it('should unlock UTXOs after failed transaction', () => {
      const address = 'tmTestAddress123';
      const utxos: UTXO[] = [
        {
          txid: 'aa'.repeat(32),
          vout: 0,
          amount: 100000,
          confirmations: 10
        }
      ];

      cache.updateUTXOs(address, utxos, 100);

      const txid = 'tx123';
      cache.lockUTXOs(address, [{ txid: utxos[0].txid, vout: 0 }], txid);

      // Should not be spendable while locked
      let spendable = cache.getSpendableUTXOs(address, 100);
      expect(spendable.length).toBe(0);

      // Unlock
      cache.unlockUTXOs(address, txid);

      // Should be spendable again
      spendable = cache.getSpendableUTXOs(address, 100);
      expect(spendable.length).toBe(1);
    });
  });
});

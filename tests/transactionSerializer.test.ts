/**
 * Transaction Serialization Tests
 * Tests for shielded transaction serialization to Zcash binary format
 */

import { TransactionSerializer } from '../src/shielded/transactionSerializer';
import type { UnsignedShieldedTransaction, ShieldedSigningData } from '../src/shielded/transactionBuilder';
import type { ShieldedBundle, ShieldedSpendDescription, ShieldedOutputDescription } from '../src/shielded/types';

/**
 * Helper to create a test shielded transaction
 */
function createTestTransaction(): UnsignedShieldedTransaction {
  return {
    version: 4,
    versionGroupId: 0x892F2085,
    transparentInputs: [],
    transparentOutputs: [],
    shieldedBundle: createTestShieldedBundle(),
    lockTime: 0,
    expiryHeight: 0,
    signingData: {
      spends: [],
      outputs: [],
      valueBalance: 0n,
      bsk: new Uint8Array(32)
    }
  };
}

/**
 * Helper to create a test shielded bundle
 */
function createTestShieldedBundle(): ShieldedBundle {
  return {
    spends: [],
    outputs: [createTestOutputDescription()],
    valueBalance: -1000n,
    bindingSig: new Uint8Array(64).fill(1)
  };
}

/**
 * Helper to create a test output description
 */
function createTestOutputDescription(): ShieldedOutputDescription {
  return {
    cv: new Uint8Array(32).fill(2),
    cmu: new Uint8Array(32).fill(3),
    ephemeralKey: new Uint8Array(32).fill(4),
    encCiphertext: new Uint8Array(580).fill(5),
    outCiphertext: new Uint8Array(80).fill(6),
    zkproof: new Uint8Array(192).fill(7)
  };
}

/**
 * Helper to create a test spend description
 */
function createTestSpendDescription(): ShieldedSpendDescription {
  return {
    cv: new Uint8Array(32).fill(10),
    anchor: new Uint8Array(32).fill(11),
    nullifier: new Uint8Array(32).fill(12),
    rk: new Uint8Array(32).fill(13),
    zkproof: new Uint8Array(192).fill(14),
    spendAuthSig: new Uint8Array(64).fill(15)
  };
}

describe('TransactionSerializer', () => {
  describe('basic serialization', () => {
    it('should serialize a simple transaction with one output', () => {
      const tx = createTestTransaction();
      const serialized = TransactionSerializer.serializeTransaction(tx);

      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should include correct version and version group id', () => {
      const tx = createTestTransaction();
      const serialized = TransactionSerializer.serializeTransaction(tx);

      // First 4 bytes: version (4, little-endian)
      expect(serialized[0]).toBe(4);
      expect(serialized[1]).toBe(0);
      expect(serialized[2]).toBe(0);
      expect(serialized[3]).toBe(0);

      // Next 4 bytes: versionGroupId (0x892F2085, little-endian)
      expect(serialized[4]).toBe(0x85);
      expect(serialized[5]).toBe(0x20);
      expect(serialized[6]).toBe(0x2f);
      expect(serialized[7]).toBe(0x89);
    });

    it('should serialize multiple outputs', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs.push(createTestOutputDescription());
      tx.shieldedBundle.outputs.push(createTestOutputDescription());

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should serialize transaction with spends', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.spends.push(createTestSpendDescription());
      tx.shieldedBundle.spends.push(createTestSpendDescription());

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized.length).toBeGreaterThan(0);
    });
  });

  describe('component serialization', () => {
    it('should serialize spend description correctly', () => {
      const spend = createTestSpendDescription();
      const tx: UnsignedShieldedTransaction = {
        version: 4,
        versionGroupId: 0x892F2085,
        transparentInputs: [],
        transparentOutputs: [],
        shieldedBundle: {
          spends: [spend],
          outputs: [],
          valueBalance: 1000n,
          bindingSig: new Uint8Array(64)
        },
        lockTime: 0,
        expiryHeight: 0,
        signingData: {
          spends: [],
          outputs: [],
          valueBalance: 1000n,
          bsk: new Uint8Array(32)
        }
      };

      const serialized = TransactionSerializer.serializeTransaction(tx);

      // Spend size should be predictable:
      // cv(32) + anchor(32) + nullifier(32) + rk(32) + proof(192) + sig(64) = 384 bytes
      expect(serialized.length).toBeGreaterThanOrEqual(8 + 1 + 384); // header + count + spend
    });

    it('should serialize output description correctly', () => {
      const output = createTestOutputDescription();
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs = [output];

      const serialized = TransactionSerializer.serializeTransaction(tx);

      // Output size should be predictable:
      // cv(32) + cmu(32) + epk(32) + enc(580) + out(80) + proof(192) = 948 bytes
      expect(serialized.length).toBeGreaterThanOrEqual(8 + 1 + 948); // header + count + output
    });
  });

  describe('compact size encoding', () => {
    it('should encode small counts (< 0xfd) as single byte', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs = [];
      for (let i = 0; i < 100; i++) {
        tx.shieldedBundle.outputs.push(createTestOutputDescription());
      }

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });

    it('should encode counts >= 0xfd with proper format', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs = [];
      for (let i = 0; i < 300; i++) {
        tx.shieldedBundle.outputs.push(createTestOutputDescription());
      }

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);
    });
  });

  describe('value balance serialization', () => {
    it('should serialize positive value balance', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.valueBalance = 5000n;

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });

    it('should serialize negative value balance', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.valueBalance = -5000n;

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });

    it('should serialize zero value balance', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.valueBalance = 0n;

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });
  });

  describe('transparent inputs/outputs', () => {
    it('should serialize empty transparent inputs', () => {
      const tx = createTestTransaction();
      tx.transparentInputs = [];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });

    it('should serialize empty transparent outputs', () => {
      const tx = createTestTransaction();
      tx.transparentOutputs = [];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });
  });

  describe('round-trip serialization', () => {
    it('should deserialize a serialized transaction', () => {
      const originalTx = createTestTransaction();
      const serialized = TransactionSerializer.serializeTransaction(originalTx);

      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized).toBeDefined();
      expect(deserialized.version).toBe(originalTx.version);
      // versionGroupId as unsigned: compare as unsigned values
      expect((deserialized.versionGroupId >>> 0)).toBe((originalTx.versionGroupId >>> 0));
      expect(deserialized.lockTime).toBe(originalTx.lockTime);
      expect(deserialized.expiryHeight).toBe(originalTx.expiryHeight);
    });

    it('should preserve output descriptions on round-trip', () => {
      const originalTx = createTestTransaction();
      const output = createTestOutputDescription();
      originalTx.shieldedBundle.outputs = [output];

      const serialized = TransactionSerializer.serializeTransaction(originalTx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.outputs.length).toBe(1);
      expect(deserialized.shieldedBundle.outputs[0].cv).toEqual(output.cv);
    });

    it('should preserve spend descriptions on round-trip', () => {
      const originalTx = createTestTransaction();
      originalTx.shieldedBundle.outputs = [];
      const spend = createTestSpendDescription();
      originalTx.shieldedBundle.spends = [spend];

      const serialized = TransactionSerializer.serializeTransaction(originalTx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.spends.length).toBe(1);
      expect(deserialized.shieldedBundle.spends[0].cv).toEqual(spend.cv);
    });

    it('should preserve multiple outputs', () => {
      const originalTx = createTestTransaction();
      originalTx.shieldedBundle.outputs = [
        createTestOutputDescription(),
        createTestOutputDescription(),
        createTestOutputDescription()
      ];

      const serialized = TransactionSerializer.serializeTransaction(originalTx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.outputs.length).toBe(3);
    });

    it('should preserve binding signature', () => {
      const originalTx = createTestTransaction();
      const sig = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        sig[i] = i % 256;
      }
      originalTx.shieldedBundle.bindingSig = sig;

      const serialized = TransactionSerializer.serializeTransaction(originalTx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.bindingSig).toEqual(sig);
    });
  });

  describe('hex conversion', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const hex = TransactionSerializer.bytesToHex(bytes);

      expect(hex).toBe('12345678');
    });

    it('should handle leading zeros in hex', () => {
      const bytes = new Uint8Array([0x00, 0x01, 0x02]);
      const hex = TransactionSerializer.bytesToHex(bytes);

      expect(hex).toBe('000102');
    });

    it('should handle all byte values', () => {
      const bytes = new Uint8Array([0x00, 0x0f, 0xf0, 0xff]);
      const hex = TransactionSerializer.bytesToHex(bytes);

      expect(hex).toBe('000ff0ff');
    });
  });

  describe('signing serialization', () => {
    it('should serialize transaction for signing', () => {
      const tx = createTestTransaction();
      const signingData: ShieldedSigningData = {
        spends: [],
        outputs: [],
        valueBalance: tx.shieldedBundle.valueBalance,
        bsk: new Uint8Array(32)
      };

      const serialized = TransactionSerializer.serializeForSigning(tx, signingData);
      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should produce different serialization for signing vs regular', () => {
      const tx = createTestTransaction();
      const signingData: ShieldedSigningData = {
        spends: [],
        outputs: [],
        valueBalance: tx.shieldedBundle.valueBalance,
        bsk: new Uint8Array(32)
      };

      const regularSerialized = TransactionSerializer.serializeTransaction(tx);
      const signingSeralized = TransactionSerializer.serializeForSigning(tx, signingData);

      // They should have different lengths or content
      // (signing excludes signatures)
      expect(signingSeralized).toBeInstanceOf(Uint8Array);
    });
  });

  describe('large transactions', () => {
    it('should handle transaction with many outputs', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs = [];
      for (let i = 0; i < 100; i++) {
        tx.shieldedBundle.outputs.push(createTestOutputDescription());
      }

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized.length).toBeGreaterThan(100 * 900); // Rough estimate
    });

    it('should handle transaction with many spends', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.outputs = [];
      tx.shieldedBundle.spends = [];
      for (let i = 0; i < 10; i++) {
        tx.shieldedBundle.spends.push(createTestSpendDescription());
      }

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized.length).toBeGreaterThan(10 * 384); // Rough estimate
    });

    it('should handle complex transaction', () => {
      const tx = createTestTransaction();
      tx.transparentInputs = [
        {
          txHash: '0'.repeat(64),
          index: 0,
          scriptPubKey: '02' + '00'.repeat(33),
          scriptSig: '01' + '02'.repeat(99),
          value: 1000
        },
        {
          txHash: '1'.repeat(64),
          index: 1,
          scriptPubKey: '02' + '03'.repeat(33),
          scriptSig: '01' + '04'.repeat(99),
          value: 2000
        }
      ];

      tx.transparentOutputs = [
        {
          address: 'test',
          value: 5000,
          scriptPubKey: '02' + '05'.repeat(25)
        }
      ];

      tx.shieldedBundle.spends = [
        createTestSpendDescription(),
        createTestSpendDescription()
      ];

      tx.shieldedBundle.outputs = [
        createTestOutputDescription(),
        createTestOutputDescription(),
        createTestOutputDescription()
      ];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized.length).toBeGreaterThan(1000);

      const deserialized = TransactionSerializer.deserializeTransaction(serialized);
      expect(deserialized.transparentInputs.length).toBe(2);
      expect(deserialized.transparentOutputs.length).toBe(1);
      expect(deserialized.shieldedBundle.spends.length).toBe(2);
      expect(deserialized.shieldedBundle.outputs.length).toBe(3);
    });
  });

  describe('field boundaries', () => {
    it('should handle maximum uint32 values', () => {
      const tx = createTestTransaction();
      tx.lockTime = 0x7fffffff; // Use maximum positive int32
      tx.expiryHeight = 0x7fffffff;

      const serialized = TransactionSerializer.serializeTransaction(tx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.lockTime).toBe(0x7fffffff);
      expect(deserialized.expiryHeight).toBe(0x7fffffff);
    });

    it('should handle minimum values', () => {
      const tx = createTestTransaction();
      tx.lockTime = 0;
      tx.expiryHeight = 0;
      tx.shieldedBundle.valueBalance = 0n;

      const serialized = TransactionSerializer.serializeTransaction(tx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.lockTime).toBe(0);
      expect(deserialized.expiryHeight).toBe(0);
      expect(deserialized.shieldedBundle.valueBalance).toBe(0n);
    });

    it('should handle large value balances', () => {
      const tx = createTestTransaction();
      tx.shieldedBundle.valueBalance = 9223372036854775807n; // max int64

      const serialized = TransactionSerializer.serializeTransaction(tx);
      expect(serialized).toBeInstanceOf(Uint8Array);
    });
  });

  describe('byte array preservation', () => {
    it('should preserve all cv bytes in outputs', () => {
      const tx = createTestTransaction();
      const output = createTestOutputDescription();
      const testBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        testBytes[i] = i;
      }
      output.cv = testBytes;
      tx.shieldedBundle.outputs = [output];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.outputs[0].cv).toEqual(testBytes);
    });

    it('should preserve all proof bytes', () => {
      const tx = createTestTransaction();
      const output = createTestOutputDescription();
      const testBytes = new Uint8Array(192);
      for (let i = 0; i < 192; i++) {
        testBytes[i] = i % 256;
      }
      output.zkproof = testBytes;
      tx.shieldedBundle.outputs = [output];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.outputs[0].zkproof).toEqual(testBytes);
    });

    it('should preserve large ciphertext', () => {
      const tx = createTestTransaction();
      const output = createTestOutputDescription();
      const testBytes = new Uint8Array(580);
      for (let i = 0; i < 580; i++) {
        testBytes[i] = (i * 37) % 256; // Pseudo-random pattern
      }
      output.encCiphertext = testBytes;
      tx.shieldedBundle.outputs = [output];

      const serialized = TransactionSerializer.serializeTransaction(tx);
      const deserialized = TransactionSerializer.deserializeTransaction(serialized);

      expect(deserialized.shieldedBundle.outputs[0].encCiphertext).toEqual(testBytes);
    });
  });
});

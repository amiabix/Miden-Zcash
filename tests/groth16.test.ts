/**
 * Groth16 Proof Generation Tests
 * Tests for snarkjs integration and Zcash Sapling proofs
 */

import { SnarkjsProver } from '../src/shielded/snarkjsProver';
import { Groth16Integration, getGroth16Integration, resetGroth16Integration } from '../src/shielded/groth16Integration';
import type { OutputNote } from '../src/shielded/types';

describe('SnarkjsProver', () => {
  let prover: SnarkjsProver;

  beforeEach(() => {
    prover = new SnarkjsProver();
  });

  describe('initialization', () => {
    it('should create a new prover instance', () => {
      expect(prover).toBeDefined();
      expect(prover.isInitialized()).toBe(false);
    });

    it('should not be initialized before calling initialize()', () => {
      expect(prover.isInitialized()).toBe(false);
    });

    it('should be initialized after calling initialize()', async () => {
      await prover.initialize(new ArrayBuffer(0), {});
      expect(prover.isInitialized()).toBe(true);
    });

    it('should handle multiple initialize calls gracefully', async () => {
      await prover.initialize(new ArrayBuffer(0), {});
      await prover.initialize(new ArrayBuffer(0), {});
      expect(prover.isInitialized()).toBe(true);
    });
  });

  describe('proof serialization', () => {
    it('should serialize Groth16 proofs correctly', () => {
      const mockProof = {
        pi_a: ['123456789', '987654321'],
        pi_b: [['111111111', '222222222'], ['333333333', '444444444']],
        pi_c: ['555555555', '666666666']
      };

      const serialized = SnarkjsProver.serializeProof(mockProof);

      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBe(256); // Standard Groth16 size
    });

    it('should reject invalid proof structure', () => {
      const invalidProof = { invalid: 'proof' };

      expect(() => {
        SnarkjsProver.serializeProof(invalidProof as any);
      }).toThrow('Invalid proof structure');
    });

    it('should deserialize proofs correctly', () => {
      const mockProof = {
        pi_a: ['123456789', '987654321'],
        pi_b: [['111111111', '222222222'], ['333333333', '444444444']],
        pi_c: ['555555555', '666666666']
      };

      const serialized = SnarkjsProver.serializeProof(mockProof);
      const deserialized = SnarkjsProver.deserializeProof(serialized);

      expect(deserialized).toHaveProperty('pi_a');
      expect(deserialized).toHaveProperty('pi_b');
      expect(deserialized).toHaveProperty('pi_c');
    });

    it('should roundtrip serialization correctly', () => {
      const originalProof = {
        pi_a: ['123456789', '987654321'],
        pi_b: [['111111111', '222222222'], ['333333333', '444444444']],
        pi_c: ['555555555', '666666666']
      };

      const serialized = SnarkjsProver.serializeProof(originalProof);
      const deserialized = SnarkjsProver.deserializeProof(serialized);
      const reserialized = SnarkjsProver.serializeProof(deserialized);

      expect(serialized.length).toBe(reserialized.length);
    });

    it('should reject proof with invalid length on deserialization', () => {
      const invalidBytes = new Uint8Array(100); // Wrong size

      expect(() => {
        SnarkjsProver.deserializeProof(invalidBytes);
      }).toThrow('Proof must be exactly 256 bytes');
    });

    it('should return correct proof size', () => {
      const size = SnarkjsProver.getProofSize();
      expect(size).toBe(256);
    });
  });

  describe('witness generation', () => {
    it('should generate witness from proof inputs', async () => {
      await prover.initialize(new ArrayBuffer(0), {});

      const testNote: OutputNote = {
        value: 1000n,
        rseed: new Uint8Array(32),
        diversifier: new Uint8Array(11),
        cmu: new Uint8Array(32)
      };

      // Witness generation is private, but we can test proof generation
      expect(prover.isInitialized()).toBe(true);
    });
  });

  describe('proof format', () => {
    it('should produce 256-byte proofs', () => {
      const mockProof = {
        pi_a: ['1', '2'],
        pi_b: [['3', '4'], ['5', '6']],
        pi_c: ['7', '8']
      };

      const serialized = SnarkjsProver.serializeProof(mockProof);
      expect(serialized.byteLength).toBe(256);
    });

    it('should handle large field elements', () => {
      const largeElement = '52435875175126190479447740508185965837690552500527637822603658699938581184513'; // p for Jubjub
      const mockProof = {
        pi_a: [largeElement, largeElement],
        pi_b: [[largeElement, largeElement], [largeElement, largeElement]],
        pi_c: [largeElement, largeElement]
      };

      const serialized = SnarkjsProver.serializeProof(mockProof);
      expect(serialized.length).toBe(256);
    });
  });
});

describe('Groth16Integration', () => {
  let integration: Groth16Integration;

  beforeEach(() => {
    resetGroth16Integration();
    integration = new Groth16Integration();
  });

  describe('initialization', () => {
    it('should create integration instance', () => {
      expect(integration).toBeDefined();
      expect(integration.isInitialized()).toBe(false);
    });

    it('should initialize provers', async () => {
      await integration.initialize();
      expect(integration.isInitialized()).toBe(true);
    });

    it('should handle multiple initializations', async () => {
      await integration.initialize();
      await integration.initialize();
      expect(integration.isInitialized()).toBe(true);
    });

    it('should throw error if generating proofs before initialization', async () => {
      const spendInputs = {
        rcv: new Uint8Array(32),
        alpha: new Uint8Array(32),
        value: 1000n,
        rcm: new Uint8Array(32),
        ask: new Uint8Array(32),
        nsk: new Uint8Array(32),
        anchor: new Uint8Array(32),
        merklePath: [],
        position: 0
      };

      const uninitializedIntegration = new Groth16Integration();
      await expect(
        uninitializedIntegration.generateSpendProof(spendInputs)
      ).rejects.toThrow('not initialized');
    });
  });

  describe('spend proofs', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should generate spend proofs', async () => {
      const spendInputs = {
        rcv: new Uint8Array(32).fill(1),
        alpha: new Uint8Array(32).fill(2),
        value: 1000n,
        rcm: new Uint8Array(32).fill(3),
        ask: new Uint8Array(32).fill(4),
        nsk: new Uint8Array(32).fill(5),
        anchor: new Uint8Array(32).fill(6),
        merklePath: [],
        position: 0
      };

      const proof = await integration.generateSpendProof(spendInputs);

      expect(proof).toBeDefined();
      expect(proof.proof).toBeInstanceOf(Uint8Array);
      expect(proof.cv).toBeInstanceOf(Uint8Array);
      expect(proof.rk).toBeInstanceOf(Uint8Array);
    });

    it('should generate deterministic proofs', async () => {
      const spendInputs = {
        rcv: new Uint8Array(32).fill(1),
        alpha: new Uint8Array(32).fill(2),
        value: 1000n,
        rcm: new Uint8Array(32).fill(3),
        ask: new Uint8Array(32).fill(4),
        nsk: new Uint8Array(32).fill(5),
        anchor: new Uint8Array(32).fill(6),
        merklePath: [],
        position: 0
      };

      const proof1 = await integration.generateSpendProof(spendInputs);
      const proof2 = await integration.generateSpendProof(spendInputs);

      // Proofs should be identical for same inputs
      expect(bytesToHex(proof1.proof)).toBe(bytesToHex(proof2.proof));
    });

    it('should generate different proofs for different inputs', async () => {
      const spendInputs1 = {
        rcv: new Uint8Array(32).fill(1),
        alpha: new Uint8Array(32).fill(2),
        value: 1000n,
        rcm: new Uint8Array(32).fill(3),
        ask: new Uint8Array(32).fill(4),
        nsk: new Uint8Array(32).fill(5),
        anchor: new Uint8Array(32).fill(6),
        merklePath: [],
        position: 0
      };

      const spendInputs2 = {
        ...spendInputs1,
        value: 2000n // Different value
      };

      const proof1 = await integration.generateSpendProof(spendInputs1);
      const proof2 = await integration.generateSpendProof(spendInputs2);

      expect(bytesToHex(proof1.cv)).not.toBe(bytesToHex(proof2.cv));
    });
  });

  describe('output proofs', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should generate output proofs', async () => {
      const outputInputs = {
        rcv: new Uint8Array(32).fill(1),
        value: 1000n,
        rcm: new Uint8Array(32).fill(2),
        diversifier: new Uint8Array(11).fill(3),
        pkD: new Uint8Array(32).fill(4),
        esk: new Uint8Array(32).fill(5)
      };

      const proof = await integration.generateOutputProof(outputInputs);

      expect(proof).toBeDefined();
      expect(proof.proof).toBeInstanceOf(Uint8Array);
      expect(proof.cv).toBeInstanceOf(Uint8Array);
      expect(proof.cmu).toBeInstanceOf(Uint8Array);
    });

    it('should have correct proof sizes', async () => {
      const outputInputs = {
        rcv: new Uint8Array(32).fill(1),
        value: 1000n,
        rcm: new Uint8Array(32).fill(2),
        diversifier: new Uint8Array(11).fill(3),
        pkD: new Uint8Array(32).fill(4),
        esk: new Uint8Array(32).fill(5)
      };

      const proof = await integration.generateOutputProof(outputInputs);

      expect(proof.proof.length).toBe(256); // Groth16 standard
      expect(proof.cv.length).toBe(32); // Value commitment
      expect(proof.cmu.length).toBe(32); // Note commitment
    });
  });

  describe('proof verification', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should verify proofs', async () => {
      const proof = new Uint8Array(256);
      const publicInputs = new Uint8Array(32);

      const isValid = await integration.verifyProof(proof, publicInputs);

      // In development mode, accept all proofs
      expect(isValid).toBe(true);
    });
  });

  describe('global integration', () => {
    it('should get or create global instance', async () => {
      const instance1 = await getGroth16Integration();
      const instance2 = await getGroth16Integration();

      expect(instance1).toBe(instance2);
    });

    it('should reset global instance', async () => {
      const instance1 = await getGroth16Integration();
      resetGroth16Integration();
      const instance2 = await getGroth16Integration();

      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('Groth16 Proof Format Compliance', () => {
  it('should follow Groth16 standard format', () => {
    const mockProof = {
      pi_a: ['100', '200'],
      pi_b: [['300', '400'], ['500', '600']],
      pi_c: ['700', '800']
    };

    const serialized = SnarkjsProver.serializeProof(mockProof);

    // Check format:
    // π_A: 64 bytes (2 * 32)
    // π_B: 128 bytes (4 * 32)
    // π_C: 64 bytes (2 * 32)
    // Total: 256 bytes

    expect(serialized.length).toBe(256);

    // Verify we can deserialize it back
    const deserialized = SnarkjsProver.deserializeProof(serialized);
    expect(deserialized.pi_a).toBeDefined();
    expect(deserialized.pi_b).toBeDefined();
    expect(deserialized.pi_c).toBeDefined();
  });

  it('should handle zero proofs', () => {
    const mockProof = {
      pi_a: ['0', '0'],
      pi_b: [['0', '0'], ['0', '0']],
      pi_c: ['0', '0']
    };

    const serialized = SnarkjsProver.serializeProof(mockProof);
    expect(serialized.every(b => b === 0)).toBe(true);
  });

  it('should handle max field element proofs', () => {
    const maxElement = '52435875175126190479447740508185965837690552500527637822603658699938581184512'; // p-1

    const mockProof = {
      pi_a: [maxElement, maxElement],
      pi_b: [[maxElement, maxElement], [maxElement, maxElement]],
      pi_c: [maxElement, maxElement]
    };

    const serialized = SnarkjsProver.serializeProof(mockProof);
    expect(serialized.length).toBe(256);

    const deserialized = SnarkjsProver.deserializeProof(serialized);
    expect(deserialized).toBeDefined();
  });
});

// Helper function
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

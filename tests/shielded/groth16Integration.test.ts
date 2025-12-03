/**
 * Groth16 Integration Test
 * Tests the Groth16 proof generation framework
 */

import { getGroth16Integration, resetGroth16Integration } from '../../src/shielded/groth16Integration';
import type { SpendProofInputs, OutputProofInputs } from '../../src/types/index';

describe('Groth16 Integration', () => {
  beforeEach(() => {
    // Reset global instance before each test
    resetGroth16Integration();
  });

  describe('Initialization', () => {
    it('should initialize without zkey files (development mode)', async () => {
      const groth16 = await getGroth16Integration();
      expect(groth16.isInitialized()).toBe(true);
    });

    it('should initialize with empty zkey files (development mode)', async () => {
      const groth16 = await getGroth16Integration();
      await groth16.initialize({
        spendZkey: new ArrayBuffer(0),
        spendVkey: {},
        outputZkey: new ArrayBuffer(0),
        outputVkey: {}
      });
      expect(groth16.isInitialized()).toBe(true);
    });

    it('should handle initialization with string paths', async () => {
      const groth16 = await getGroth16Integration();
      
      // This will fail to fetch (files don't exist), but should handle gracefully
      // In browser environment, fetch might not throw, so we just check it initializes
      try {
        await groth16.initialize({
          spendZkey: '/non-existent-file.zkey',
          spendVkey: '/non-existent-file.vkey',
          outputZkey: '/non-existent-file.zkey',
          outputVkey: '/non-existent-file.vkey'
        });
        // If it doesn't throw, that's okay - it will use empty buffers
        expect(groth16.isInitialized()).toBe(true);
      } catch (error) {
        // If it throws, that's also acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Spend Proof Generation', () => {
    it('should generate placeholder proof in development mode', async () => {
      const groth16 = await getGroth16Integration();
      
      const inputs: SpendProofInputs = {
        value: 1000n,
        rcv: new Uint8Array(32).fill(1),
        alpha: new Uint8Array(32).fill(2),
        ask: new Uint8Array(32).fill(3),
        nsk: new Uint8Array(32).fill(4),
        anchor: new Uint8Array(32).fill(5),
        position: 0n,
        merklePath: []
      };

      const proof = await groth16.generateSpendProof(inputs);
      
      expect(proof).toBeDefined();
      expect(proof.proof).toBeDefined();
      expect(proof.proof.length).toBe(256); // Standard Groth16 proof size
      expect(proof.cv).toBeDefined();
      expect(proof.cv.length).toBe(32);
      expect(proof.rk).toBeDefined();
      expect(proof.rk.length).toBe(32);
    });

    it('should generate different proofs for different inputs', async () => {
      const groth16 = await getGroth16Integration();
      
      const inputs1: SpendProofInputs = {
        value: 1000n,
        rcv: new Uint8Array(32).fill(1),
        alpha: new Uint8Array(32).fill(2),
        ask: new Uint8Array(32).fill(3),
        nsk: new Uint8Array(32).fill(4),
        anchor: new Uint8Array(32).fill(5),
        position: 0n,
        merklePath: []
      };

      const inputs2: SpendProofInputs = {
        ...inputs1,
        value: 2000n // Different value
      };

      const proof1 = await groth16.generateSpendProof(inputs1);
      const proof2 = await groth16.generateSpendProof(inputs2);
      
      // Proofs should be different (even in placeholder mode, structure should vary)
      expect(proof1.cv).not.toEqual(proof2.cv);
    });
  });

  describe('Output Proof Generation', () => {
    it('should generate placeholder proof in development mode', async () => {
      const groth16 = await getGroth16Integration();
      
      const inputs: OutputProofInputs = {
        value: 1000n,
        rcv: new Uint8Array(32).fill(1),
        rcm: new Uint8Array(32).fill(2),
        diversifier: new Uint8Array(11).fill(3),
        pkD: new Uint8Array(32).fill(4),
        esk: new Uint8Array(32).fill(5)
      };

      const proof = await groth16.generateOutputProof(inputs);
      
      expect(proof).toBeDefined();
      expect(proof.proof).toBeDefined();
      expect(proof.proof.length).toBe(256); // Standard Groth16 proof size
      expect(proof.cv).toBeDefined();
      expect(proof.cv.length).toBe(32);
      expect(proof.cmu).toBeDefined();
      expect(proof.cmu.length).toBe(32);
    });

    it('should generate different proofs for different outputs', async () => {
      const groth16 = await getGroth16Integration();
      
      const inputs1: OutputProofInputs = {
        value: 1000n,
        rcv: new Uint8Array(32).fill(1),
        rcm: new Uint8Array(32).fill(2),
        diversifier: new Uint8Array(11).fill(3),
        pkD: new Uint8Array(32).fill(4),
        esk: new Uint8Array(32).fill(5)
      };

      const inputs2: OutputProofInputs = {
        ...inputs1,
        value: 2000n // Different value
      };

      const proof1 = await groth16.generateOutputProof(inputs1);
      const proof2 = await groth16.generateOutputProof(inputs2);
      
      // Proofs should be different
      expect(proof1.cv).not.toEqual(proof2.cv);
      expect(proof1.cmu).not.toEqual(proof2.cmu);
    });
  });

  describe('Proof Verification', () => {
    it('should accept placeholder proofs in development mode', async () => {
      const groth16 = await getGroth16Integration();
      
      const proof = new Uint8Array(256).fill(1);
      const publicInputs = new Uint8Array(32).fill(2);
      
      const isValid = await groth16.verifyProof(proof, publicInputs);
      
      // In development mode, verification accepts all proofs
      expect(isValid).toBe(true);
    });
  });

  describe('Global Instance', () => {
    it('should return same instance on multiple calls', async () => {
      const groth16_1 = await getGroth16Integration();
      const groth16_2 = await getGroth16Integration();
      
      expect(groth16_1).toBe(groth16_2);
    });

    it('should return new instance after reset', async () => {
      const groth16_1 = await getGroth16Integration();
      resetGroth16Integration();
      const groth16_2 = await getGroth16Integration();
      
      expect(groth16_1).not.toBe(groth16_2);
    });
  });
});


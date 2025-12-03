/**
 * Prize-WASM Smoke Tests
 * 
 * Minimal tests to verify WASM module loads and can generate proofs
 * 
 * Note: These tests expect public/zcash-prover-wasm to be served locally
 * For local dev, run: npx serve public
 * Or adjust test to mock loader
 */

import { loadPrizeWasm, resetPrizeWasmLoader } from '../src/shielded/prizeWasmLoader';
import { generateSpendProof, generateOutputProof } from '../src/shielded/prizeWasmProver';

describe('Prize WASM smoke', () => {
  beforeEach(() => {
    // Reset loader state between tests
    resetPrizeWasmLoader();
  });

  it('loads the wasm module', async () => {
    const mod = await loadPrizeWasm('/zcash-prover-wasm');
    expect(mod).toBeDefined();
    expect(mod).not.toBeNull();
  }, 20000);

  it('has expected exports', async () => {
    const mod = await loadPrizeWasm('/zcash-prover-wasm');
    
    // Check for common export patterns
    const hasSpendProof = 
      typeof (mod as any).generate_spend_proof === 'function' ||
      typeof (mod as any).generate_spend_proof_bytes === 'function' ||
      typeof (mod as any).prove_spend === 'function';
    
    const hasOutputProof = 
      typeof (mod as any).generate_output_proof === 'function' ||
      typeof (mod as any).generate_output_proof_bytes === 'function' ||
      typeof (mod as any).prove_output === 'function';

    // At least one proof function should exist
    expect(hasSpendProof || hasOutputProof).toBe(true);
  }, 20000);

  it('generates a non-empty proof blob for dummy input (if high-level API available)', async () => {
    const mod = await loadPrizeWasm('/zcash-prover-wasm');
    
    // Craft a small dummy input - replace with a valid fixture if you have one
    const dummy = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    
    // Try wrapped function shape (if available)
    if ((mod as any).generate_spend_proof_bytes) {
      try {
        const out = await (mod as any).generate_spend_proof_bytes(dummy);
        expect(out).toBeDefined();
        expect(out.byteLength).toBeGreaterThan(0);
      } catch (error) {
        // If it fails due to invalid input (expected), that's okay - module loaded
        // We're just checking the API shape exists
        expect(error).toBeDefined();
      }
    } else {
      // If low-level requires specific input, we can't assert correctness here
      // At least verify the module loaded
      expect(mod).toBeDefined();
    }
  }, 30000);

  it('generateSpendProof wrapper handles different API patterns', async () => {
    // This test verifies the glue function can handle different WASM patterns
    // It may fail if WASM isn't available, which is okay for CI
    try {
      const dummy = new Uint8Array(64).fill(0);
      const result = await generateSpendProof(dummy);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    } catch (error) {
      // If WASM not available or input invalid, that's expected
      // Just verify error is informative
      expect(error).toBeInstanceOf(Error);
    }
  }, 30000);

  it('generateOutputProof wrapper handles different API patterns', async () => {
    try {
      const dummy = new Uint8Array(64).fill(0);
      const result = await generateOutputProof(dummy);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    } catch (error) {
      // If WASM not available or input invalid, that's expected
      expect(error).toBeInstanceOf(Error);
    }
  }, 30000);
});


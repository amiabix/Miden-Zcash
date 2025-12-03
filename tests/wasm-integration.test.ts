/**
 * WASM Integration Test
 * 
 * Tests the actual WASM module loading and proof generation.
 * This requires the WASM files to be available.
 */

import { loadPrizeWasm, getPrizeWasmInfo, resetPrizeWasmLoader } from '../src/shielded/prizeWasmLoader';

// Skip if not in browser environment (WASM loading requires fetch)
const isNodeWithoutFetch = typeof fetch === 'undefined';

describe('WASM Module Integration', () => {
  beforeEach(() => {
    resetPrizeWasmLoader();
  });

  describe('Module Loading', () => {
    it('should report module info before loading', () => {
      const info = getPrizeWasmInfo();
      expect(info.loaded).toBe(false);
      expect(info.exports).toHaveLength(0);
    });

    // This test will only work in a browser environment with WASM files available
    it.skip('should load WASM module and expose prove_spend and prove_output', async () => {
      const mod = await loadPrizeWasm('/');
      
      const info = getPrizeWasmInfo();
      console.log('WASM Module Info:', info);
      console.log('Available exports:', info.exports);
      
      expect(info.loaded).toBe(true);
      
      // Check for the actual proof functions
      expect(typeof mod.prove_spend).toBe('function');
      expect(typeof mod.prove_output).toBe('function');
      expect(typeof mod.verify_spend).toBe('function');
      expect(typeof mod.verify_output).toBe('function');
    });
  });

  describe('Proof Generation (Requires WASM)', () => {
    // These tests require actual WASM to be loaded
    // They are marked as skip by default and should be run in browser
    
    it.skip('should generate spend proof', async () => {
      const mod = await loadPrizeWasm('/');
      
      if (!mod.prove_spend) {
        console.log('prove_spend not available, skipping');
        return;
      }
      
      // Test inputs (these would need to be valid for real proofs)
      const spendingKey = new Uint8Array(32).fill(0x01);
      const value = 100000n;
      const rcv = new Uint8Array(32).fill(0x02);
      const alpha = new Uint8Array(32).fill(0x03);
      const anchor = new Uint8Array(32).fill(0x04);
      const merklePath = new Uint8Array(32 * 32); // 32 levels of 32-byte hashes
      const position = 0n;
      
      try {
        const proof = mod.prove_spend(
          spendingKey,
          value,
          rcv,
          alpha,
          anchor,
          merklePath,
          position
        );
        
        console.log('Spend proof generated:', proof?.length, 'bytes');
        expect(proof).toBeInstanceOf(Uint8Array);
        expect(proof.length).toBe(192);
      } catch (error) {
        console.error('Spend proof generation failed:', error);
        throw error;
      }
    });

    it.skip('should generate output proof', async () => {
      const mod = await loadPrizeWasm('/');
      
      if (!mod.prove_output) {
        console.log('prove_output not available, skipping');
        return;
      }
      
      // Test inputs
      const value = 100000n;
      const rcv = new Uint8Array(32).fill(0x11);
      const rcm = new Uint8Array(32).fill(0x22);
      const diversifier = new Uint8Array(11).fill(0x33);
      const pkD = new Uint8Array(32).fill(0x44);
      const esk = new Uint8Array(32).fill(0x55);
      
      try {
        const proof = mod.prove_output(
          value,
          rcv,
          rcm,
          diversifier,
          pkD,
          esk
        );
        
        console.log('Output proof generated:', proof?.length, 'bytes');
        expect(proof).toBeInstanceOf(Uint8Array);
        expect(proof.length).toBe(192);
      } catch (error) {
        console.error('Output proof generation failed:', error);
        throw error;
      }
    });
  });
});

/**
 * Browser Test Runner
 * 
 * To test WASM in browser, create an HTML file that:
 * 1. Serves the WASM files
 * 2. Loads this test
 * 3. Runs the proof generation
 * 
 * Example usage in browser console:
 * 
 * ```javascript
 * import { loadPrizeWasm } from './dist/shielded/prizeWasmLoader.js';
 * 
 * const mod = await loadPrizeWasm('/');
 * console.log('Available functions:', Object.keys(mod).filter(k => typeof mod[k] === 'function'));
 * 
 * // Test spend proof
 * const proof = mod.prove_spend(
 *   new Uint8Array(32).fill(1),  // spending_key
 *   100000n,                      // value
 *   new Uint8Array(32).fill(2),  // rcv
 *   new Uint8Array(32).fill(3),  // alpha
 *   new Uint8Array(32).fill(4),  // anchor
 *   new Uint8Array(1024),        // merkle_path
 *   0n                           // position
 * );
 * console.log('Proof:', proof);
 * ```
 */

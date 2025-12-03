/**
 * Prize-WASM Optional Entry Point
 * 
 * This file provides an optional entry point for Prize-WASM modules.
 * Import from here if you need Prize-WASM functionality.
 * 
 * Usage:
 *   import { PrizeWasmProver } from '@miden/zcash-integration/shielded/prizeWasm';
 */

// Re-export everything from prizeWasm modules
export { PrizeWasmProver, getPrizeWasmProver } from './prizeWasmProver.js';
export { 
  loadPrizeWasm, 
  isPrizeWasmLoaded, 
  getPrizeWasmModule, 
  getPrizeWasmInfo,
  resetPrizeWasmLoader 
} from './prizeWasmLoader.js';
export type { PrizeWasmModule } from './prizeWasmLoader.js';


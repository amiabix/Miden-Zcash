/**
 * Prize-WASM Loader
 * 
 * Robust browser loader for Prize-WASM Sapling Groth16 Prover
 * Handles multiple wasm-pack output patterns and bundler compatibility
 */

export type PrizeWasmModule = {
  // Initialization functions (common wasm-pack output)
  init?: (wasm?: any) => Promise<void>;
  default?: () => Promise<void> | any;
  
  // ============================================================
  // ACTUAL WASM EXPORTS from zcash_prover_wasm
  // These are the real Groth16 proof generation functions
  // ============================================================
  
  /**
   * Generate Sapling spend proof
   * @param spending_key - 32 byte spending key (ask)
   * @param value - zatoshi value as bigint
   * @param rcv - 32 byte randomness for value commitment
   * @param alpha - 32 byte randomness for randomized key
   * @param anchor - 32 byte merkle tree root
   * @param merkle_path - serialized merkle witness path
   * @param position - position in tree as bigint
   * @returns 192 byte Groth16 proof
   */
  prove_spend?: (
    spending_key: Uint8Array,
    value: bigint,
    rcv: Uint8Array,
    alpha: Uint8Array,
    anchor: Uint8Array,
    merkle_path: Uint8Array,
    position: bigint
  ) => Uint8Array;
  
  /**
   * Generate Sapling output proof
   * @param value - zatoshi value as bigint
   * @param rcv - 32 byte randomness for value commitment
   * @param rcm - 32 byte randomness for note commitment
   * @param diversifier - 11 byte diversifier
   * @param pk_d - 32 byte diversified payment address public key
   * @param esk - 32 byte ephemeral secret key
   * @returns 192 byte Groth16 proof
   */
  prove_output?: (
    value: bigint,
    rcv: Uint8Array,
    rcm: Uint8Array,
    diversifier: Uint8Array,
    pk_d: Uint8Array,
    esk: Uint8Array
  ) => Uint8Array;
  
  /**
   * Verify Sapling spend proof
   */
  verify_spend?: (
    proof: Uint8Array,
    cv: Uint8Array,
    anchor: Uint8Array,
    nullifier: Uint8Array,
    rk: Uint8Array
  ) => boolean;
  
  /**
   * Verify Sapling output proof
   */
  verify_output?: (
    proof: Uint8Array,
    cv: Uint8Array,
    cmu: Uint8Array,
    ephemeral_key: Uint8Array
  ) => boolean;
  
  // Legacy high-level wrappers (may exist in some builds)
  generate_spend_proof_bytes?: (input: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  generate_output_proof_bytes?: (input: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  
  // Low-level pointer API (for older wasm-pack builds)
  alloc?: (len: number) => number;
  dealloc?: (ptr: number, len: number) => void;
  generate_spend_proof?: any;
  generate_output_proof?: any;
  
  memory?: WebAssembly.Memory;
  
  // Additional exports
  [key: string]: any;
};

let _module: PrizeWasmModule | null = null;
let _ready: Promise<PrizeWasmModule> | null = null;

/**
 * Load Prize-WASM module
 * 
 * @param baseUrl - Base URL for WASM files (default: '/zcash-prover-wasm')
 * @returns Promise resolving to loaded WASM module
 */
export async function loadPrizeWasm(baseUrl: string = '/zcash-prover-wasm'): Promise<PrizeWasmModule> {
  if (_module) return _module;
  if (_ready) return _ready;

  _ready = (async () => {
    // Attempt 1: dynamic import of generated JS wrapper (common wasm-pack output)
    // Try multiple possible file names
    const possibleWrapperPaths = [
      `${baseUrl}/prize_wasm.js`,
      `${baseUrl}/prize_wasm_masp_groth16_prover.js`,
      `${baseUrl}/prize-wasm.js`,
      '/zcash_prover_wasm.js', // Fallback to existing build
      '/rust-wasm/pkg/zcash_prover_wasm.js' // Development path
    ];

    for (const wrapperPath of possibleWrapperPaths) {
      try {
        // webpackIgnore prevents bundlers from trying to bundle the dynamic file
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const wrapper = await import(/* webpackIgnore: true */ /* @vite-ignore */ wrapperPath);
        
        // Some wasm-pack builds export a default async init function
        if (typeof wrapper === 'function') {
          // wrapper() typically instantiates the wasm and returns exports
          const mod = await wrapper(); // may be the exports object
          _module = mod as unknown as PrizeWasmModule;
          return _module!;
        } else if (wrapper && typeof wrapper.default === 'function') {
          const mod = await wrapper.default();
          _module = mod as unknown as PrizeWasmModule;
          return _module!;
        } else {
          _module = wrapper as unknown as PrizeWasmModule;
          
          // Call init() if available
          if (_module.init && typeof _module.init === 'function') {
            await _module.init();
          }
          
          return _module!;
        }
      } catch (err) {
        // Continue to next path or fallback
        // console.debug('prizeWasmLoader: wrapper import failed for', wrapperPath, err);
        continue;
      }
    }

    // Attempt 2: fetch and instantiate raw wasm binary
    const possibleWasmPaths = [
      `${baseUrl}/prize_wasm_bg.wasm`,
      `${baseUrl}/prize_wasm_masp_groth16_prover_bg.wasm`,
      `${baseUrl}/prize-wasm_bg.wasm`,
      '/zcash_prover_wasm_bg.wasm', // Fallback to existing build
      '/rust-wasm/pkg/zcash_prover_wasm_bg.wasm' // Development path
    ];

    for (const wasmPath of possibleWasmPaths) {
      try {
        const wasmRes = await fetch(wasmPath);
        if (!wasmRes.ok) continue;

        const wasmArray = await wasmRes.arrayBuffer();

        // Minimal import object; extend if your wasm requires env functions
        const importObject: WebAssembly.Imports = {
          env: {
            // Add required imports if any (memory is typically provided by wasm)
            // abort: () => {}
          }
        };

        const instance = await WebAssembly.instantiate(wasmArray, importObject);
        const exports = instance.instance.exports as unknown as PrizeWasmModule;
        _module = exports;
        return _module!;
      } catch (err) {
        // Continue to next path
        continue;
      }
    }

    // Last resort — throw error
    throw new Error(
      `Failed to load Prize WASM prover. ` +
      `Tried paths: ${possibleWrapperPaths.join(', ')} and ${possibleWasmPaths.join(', ')}. ` +
      `Ensure WASM files are built and available.`
    );
  })();

  try {
    return await _ready;
  } finally {
    // Clear loading promise on completion (success or failure)
    _ready = null;
  }
}

/**
 * Check if Prize-WASM is loaded
 */
export function isPrizeWasmLoaded(): boolean {
  return _module !== null;
}

/**
 * Get loaded module (throws if not loaded)
 */
export function getPrizeWasmModule(): PrizeWasmModule {
  if (!_module) {
    throw new Error('Prize-WASM module not loaded. Call loadPrizeWasm() first.');
  }
  return _module;
}

/**
 * Reset loader (for testing)
 */
export function resetPrizeWasmLoader(): void {
  _module = null;
  _ready = null;
}

/**
 * Get WASM module info for debugging
 */
export function getPrizeWasmInfo(): {
  loaded: boolean;
  hasMemory: boolean;
  exports: string[];
} {
  if (!_module) {
    return {
      loaded: false,
      hasMemory: false,
      exports: []
    };
  }
  
  return {
    loaded: true,
    hasMemory: !!_module.memory,
    exports: Object.keys(_module).filter(key => 
      typeof _module![key] === 'function' || key === 'memory'
    )
  };
}

/**
 * Prover Status and Diagnostics
 * 
 * Provides comprehensive status reporting for the Groth16 prover system,
 * including WASM detection, initialization status, and error diagnostics.
 */

import type { ProverType } from './groth16Integration.js';

/**
 * Prover availability status
 */
export interface ProverAvailability {
  prizeWasm: boolean;
  librustzcash: boolean;
  snarkjs: boolean;
  delegated: boolean;
}

/**
 * Detailed prover status
 */
export interface ProverStatus {
  /** Whether the prover system is initialized */
  initialized: boolean;
  /** The active prover type */
  activeProver: ProverType | null;
  /** Availability of each prover type */
  availability: ProverAvailability;
  /** Whether real proofs can be generated (vs placeholders) */
  canGenerateRealProofs: boolean;
  /** Human-readable status message */
  statusMessage: string;
  /** Any errors that occurred during detection */
  errors: string[];
  /** Recommendations for improving prover setup */
  recommendations: string[];
}

/**
 * Input validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate spend proof inputs
 */
export function validateSpendProofInputs(inputs: {
  rcv?: Uint8Array;
  alpha?: Uint8Array;
  value?: bigint | number;
  rcm?: Uint8Array;
  ask?: Uint8Array;
  nsk?: Uint8Array;
  anchor?: Uint8Array;
  merklePath?: Uint8Array[];
  position?: number;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!inputs.rcv || inputs.rcv.length !== 32) {
    errors.push('rcv must be 32 bytes');
  }
  if (!inputs.alpha || inputs.alpha.length !== 32) {
    errors.push('alpha must be 32 bytes');
  }
  if (inputs.value === undefined || inputs.value === null) {
    errors.push('value is required');
  } else if (typeof inputs.value === 'bigint' && inputs.value < 0n) {
    errors.push('value must be non-negative');
  } else if (typeof inputs.value === 'number' && inputs.value < 0) {
    errors.push('value must be non-negative');
  }
  if (!inputs.rcm || inputs.rcm.length !== 32) {
    errors.push('rcm must be 32 bytes');
  }
  if (!inputs.ask || inputs.ask.length !== 32) {
    errors.push('ask (spending key) must be 32 bytes');
  }
  if (!inputs.nsk || inputs.nsk.length !== 32) {
    errors.push('nsk (nullifier key) must be 32 bytes');
  }

  // Optional fields with recommendations
  if (!inputs.anchor || inputs.anchor.length !== 32) {
    warnings.push('anchor should be 32 bytes for valid proofs');
  }
  if (!inputs.merklePath || inputs.merklePath.length === 0) {
    warnings.push('merklePath is empty - proof may not verify on chain');
  }

  // Check for all-zero values which may indicate uninitialized data
  if (inputs.ask && inputs.ask.every(b => b === 0)) {
    warnings.push('ask is all zeros - this may be uninitialized');
  }
  if (inputs.nsk && inputs.nsk.every(b => b === 0)) {
    warnings.push('nsk is all zeros - this may be uninitialized');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate output proof inputs
 */
export function validateOutputProofInputs(inputs: {
  rcv?: Uint8Array;
  value?: bigint | number;
  rcm?: Uint8Array;
  diversifier?: Uint8Array;
  pkD?: Uint8Array;
  esk?: Uint8Array;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!inputs.rcv || inputs.rcv.length !== 32) {
    errors.push('rcv must be 32 bytes');
  }
  if (inputs.value === undefined || inputs.value === null) {
    errors.push('value is required');
  } else if (typeof inputs.value === 'bigint' && inputs.value < 0n) {
    errors.push('value must be non-negative');
  } else if (typeof inputs.value === 'number' && inputs.value < 0) {
    errors.push('value must be non-negative');
  }
  if (!inputs.rcm || inputs.rcm.length !== 32) {
    errors.push('rcm must be 32 bytes');
  }
  if (!inputs.diversifier || inputs.diversifier.length !== 11) {
    errors.push('diversifier must be 11 bytes');
  }
  if (!inputs.pkD || inputs.pkD.length !== 32) {
    errors.push('pkD must be 32 bytes');
  }

  // Optional fields
  if (!inputs.esk || inputs.esk.length !== 32) {
    warnings.push('esk should be 32 bytes for note encryption');
  }

  // Check for all-zero values
  if (inputs.diversifier && inputs.diversifier.every(b => b === 0)) {
    warnings.push('diversifier is all zeros - consider using a non-trivial diversifier');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Log prover status in a formatted way
 * 
 * This function is intended for debugging and development purposes.
 * It outputs detailed prover status information to the console.
 * 
 * @param status - The prover status to log
 */
export function logProverStatus(status: ProverStatus): void {
  console.group('[Groth16 Prover Status]');
  
  console.log(`Initialized: ${status.initialized ? 'Yes' : 'No'}`);
  console.log(`Active Prover: ${status.activeProver || 'None'}`);
  console.log(`Can Generate Real Proofs: ${status.canGenerateRealProofs ? 'Yes' : 'No'}`);
  
  console.group('Availability:');
  console.log(`  Prize-WASM: ${status.availability.prizeWasm ? 'Available' : 'Not Available'}`);
  console.log(`  librustzcash: ${status.availability.librustzcash ? 'Available' : 'Not Available'}`);
  console.log(`  snarkjs: ${status.availability.snarkjs ? 'Available' : 'Not Available'}`);
  console.log(`  Delegated: ${status.availability.delegated ? 'Configured' : 'Not Configured'}`);
  console.groupEnd();

  if (status.errors.length > 0) {
    console.group('Errors:');
    status.errors.forEach(err => console.error(`  - ${err}`));
    console.groupEnd();
  }

  if (status.recommendations.length > 0) {
    console.group('Recommendations:');
    status.recommendations.forEach(rec => console.info(`  - ${rec}`));
    console.groupEnd();
  }

  console.log(`Status: ${status.statusMessage}`);
  console.groupEnd();
}

/**
 * Log validation result
 * 
 * This function is intended for debugging and development purposes.
 * It outputs validation errors and warnings to the console.
 * 
 * @param context - Context string for the validation (e.g., "SpendProof")
 * @param result - The validation result to log
 */
export function logValidationResult(context: string, result: ValidationResult): void {
  if (!result.valid || result.warnings.length > 0) {
    console.group(`[${context}] Input Validation`);
    
    if (result.errors.length > 0) {
      console.error('Errors:');
      result.errors.forEach(err => console.error(`  - ${err}`));
    }
    
    if (result.warnings.length > 0) {
      console.warn('Warnings:');
      result.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }
    
    console.groupEnd();
  }
}

/**
 * Create a detailed error for prover failures
 */
export function createProverError(
  operation: 'spend' | 'output',
  proverType: ProverType,
  originalError: Error | string,
  inputs?: Record<string, unknown>
): Error {
  const errorMessage = originalError instanceof Error ? originalError.message : String(originalError);
  
  let detailedMessage = `[Groth16] Failed to generate ${operation} proof\n`;
  detailedMessage += `  Prover Type: ${proverType}\n`;
  detailedMessage += `  Error: ${errorMessage}\n`;
  
  if (inputs) {
    detailedMessage += `  Input Summary:\n`;
    for (const [key, value] of Object.entries(inputs)) {
      if (value instanceof Uint8Array) {
        detailedMessage += `    ${key}: Uint8Array(${value.length})\n`;
      } else if (typeof value === 'bigint') {
        detailedMessage += `    ${key}: ${value.toString()}n\n`;
      } else {
        detailedMessage += `    ${key}: ${JSON.stringify(value)}\n`;
      }
    }
  }

  detailedMessage += `\nTroubleshooting:\n`;
  detailedMessage += `  1. Ensure WASM files are properly loaded\n`;
  detailedMessage += `  2. Check that all input values are valid\n`;
  detailedMessage += `  3. Verify the prover is initialized before use\n`;
  
  const error = new Error(detailedMessage);
  error.name = 'ProverError';
  return error;
}

/**
 * Detect available provers and return status
 */
export async function detectProverAvailability(): Promise<ProverAvailability> {
  const availability: ProverAvailability = {
    prizeWasm: false,
    librustzcash: false,
    snarkjs: false,
    delegated: false
  };

  // Check Prize-WASM
  try {
    const { isPrizeWasmLoaded } = await import('./prizeWasmLoader');
    availability.prizeWasm = isPrizeWasmLoaded();
  } catch {
    // Prize-WASM module not available
  }

  // Check librustzcash
  try {
    const { LibrustzcashProver } = await import('./librustzcashProver');
    const prover = new LibrustzcashProver();
    await prover.initialize();
    availability.librustzcash = prover.isInitialized();
  } catch {
    // librustzcash not available
  }

  // Check snarkjs (always available as fallback)
  try {
    const { SnarkjsProver } = await import('./snarkjsProver');
    availability.snarkjs = true;
    // Real zkeys may not be available
  } catch {
    // snarkjs not available
  }

  return availability;
}

/**
 * Get comprehensive prover status
 */
export async function getProverStatus(): Promise<ProverStatus> {
  const errors: string[] = [];
  const recommendations: string[] = [];
  
  const availability = await detectProverAvailability();
  
  // Determine active prover and status
  let activeProver: ProverType | null = null;
  let canGenerateRealProofs = false;
  let initialized = false;

  try {
    const { getGroth16Integration } = await import('./groth16Integration');
    const groth16 = await getGroth16Integration();
    initialized = groth16.isInitialized();
    activeProver = groth16.getProverType();
    
    // Check if we can generate real proofs
    if (activeProver === 'prize-wasm' && availability.prizeWasm) {
      canGenerateRealProofs = true;
    } else if (activeProver === 'librustzcash' && availability.librustzcash) {
      canGenerateRealProofs = true;
    } else if (activeProver === 'delegated') {
      canGenerateRealProofs = true;
    }
    // snarkjs requires zkeys for real proofs
  } catch (error) {
    errors.push(`Failed to get Groth16 integration: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Generate recommendations
  if (!availability.prizeWasm && !availability.librustzcash) {
    recommendations.push('Install Prize-WASM or librustzcash WASM for browser-based proof generation');
  }
  if (!canGenerateRealProofs && initialized) {
    recommendations.push('Current configuration may not produce valid proofs for mainnet');
  }
  if (activeProver === 'snarkjs') {
    recommendations.push('snarkjs requires .zkey files for real proofs. Consider using Prize-WASM instead.');
  }

  // Generate status message
  let statusMessage = 'Unknown';
  if (!initialized) {
    statusMessage = 'Prover system not initialized';
  } else if (canGenerateRealProofs) {
    statusMessage = `Ready with ${activeProver} prover`;
  } else {
    statusMessage = `Initialized with ${activeProver} but may not produce valid proofs`;
  }

  return {
    initialized,
    activeProver,
    availability,
    canGenerateRealProofs,
    statusMessage,
    errors,
    recommendations
  };
}

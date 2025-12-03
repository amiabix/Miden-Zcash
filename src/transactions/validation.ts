/**
 * Transaction Validation
 * Validates Zcash transactions before signing and broadcasting
 */

import type { Transaction, ValidationResult, TransparentInput, TransparentOutput } from '../types/index';

/**
 * Transaction constants
 */
const MIN_VERSION = 1;
const MAX_VERSION = 5;
const MINIMUM_FEE = 1000; // zatoshi
const MAX_TRANSACTION_SIZE = 2000000; // bytes

/**
 * Transaction Validator
 */
export class TransactionValidator {
  private currentBlockHeight: number = 0;

  /**
   * Set current block height (for expiry validation)
   */
  setCurrentBlockHeight(height: number): void {
    this.currentBlockHeight = height;
  }

  /**
   * Validate transaction
   */
  validateTransaction(tx: Transaction): ValidationResult {
    const errors: string[] = [];

    // 1. Check version
    if (tx.version < MIN_VERSION || tx.version > MAX_VERSION) {
      errors.push(`Invalid transaction version: ${tx.version}`);
    }

    // 2. Check expiry height
    if (tx.expiryHeight > 0 && tx.expiryHeight < this.currentBlockHeight) {
      errors.push(`Transaction expired: expiry height ${tx.expiryHeight} < current height ${this.currentBlockHeight}`);
    }

    // 3. Validate inputs
    if (tx.transparentInputs.length === 0 && (!tx.shieldedInputs || tx.shieldedInputs.length === 0)) {
      errors.push('Transaction must have at least one input');
    }

    for (let i = 0; i < tx.transparentInputs.length; i++) {
      const input = tx.transparentInputs[i];
      const inputErrors = this.validateInput(input, i);
      errors.push(...inputErrors);
    }

    // 4. Validate outputs
    if (tx.transparentOutputs.length === 0 && (!tx.shieldedOutputs || tx.shieldedOutputs.length === 0)) {
      errors.push('Transaction must have at least one output');
    }

    for (let i = 0; i < tx.transparentOutputs.length; i++) {
      const output = tx.transparentOutputs[i];
      const outputErrors = this.validateOutput(output, i);
      errors.push(...outputErrors);
    }

    // 5. Check balance
    const balanceValidation = this.validateBalance(tx);
    if (!balanceValidation.valid) {
      errors.push(...balanceValidation.errors);
    }

    // 6. Validate shielded components (if any)
    if (tx.shieldedInputs || tx.shieldedOutputs) {
      const shieldedValidation = this.validateShieldedComponents(tx);
      errors.push(...shieldedValidation.errors);
    }

    // 7. Check transaction size (estimate)
    const estimatedSize = this.estimateTransactionSize(tx);
    if (estimatedSize > MAX_TRANSACTION_SIZE) {
      errors.push(`Transaction too large: ${estimatedSize} bytes > ${MAX_TRANSACTION_SIZE} bytes`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate input
   */
  private validateInput(input: TransparentInput, index: number): string[] {
    const errors: string[] = [];

    // Check txHash format (should be 64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(input.txHash)) {
      errors.push(`Invalid input ${index}: txHash format`);
    }

    // Check index is valid
    if (input.index < 0 || input.index > 0xFFFFFFFF) {
      errors.push(`Invalid input ${index}: index out of range`);
    }

    // Check value is positive
    if (input.value < 0) {
      errors.push(`Invalid input ${index}: negative value`);
    }

    // Check scriptPubKey is present
    if (!input.scriptPubKey || input.scriptPubKey.length === 0) {
      errors.push(`Invalid input ${index}: missing scriptPubKey`);
    }

    // Check sequence is valid
    if (input.sequence < 0 || input.sequence > 0xFFFFFFFF) {
      errors.push(`Invalid input ${index}: sequence out of range`);
    }

    return errors;
  }

  /**
   * Validate output
   */
  private validateOutput(output: TransparentOutput, index: number): string[] {
    const errors: string[] = [];

    // Check address is present
    if (!output.address || output.address.length === 0) {
      errors.push(`Invalid output ${index}: missing address`);
    }

    // Check value is positive
    if (output.value <= 0) {
      errors.push(`Invalid output ${index}: value must be positive`);
    }

    // Check value is not too large (prevent overflow)
    if (output.value > Number.MAX_SAFE_INTEGER) {
      errors.push(`Invalid output ${index}: value too large`);
    }

    // Check scriptPubKey is present (or address can be used to derive it)
    // For MVP: allow empty scriptPubKey if address is present (will be generated during signing)
    if (!output.scriptPubKey || output.scriptPubKey.length === 0) {
      // Only error if address is also missing (can't derive scriptPubKey)
      if (!output.address || output.address.length === 0) {
        errors.push(`Invalid output ${index}: missing scriptPubKey and address`);
      }
      // Otherwise, scriptPubKey will be generated from address during signing
    }

    return errors;
  }

  /**
   * Validate balance (inputs >= outputs + fee)
   */
  private validateBalance(tx: Transaction): ValidationResult {
    const errors: string[] = [];

    // Sum transparent inputs
    const inputTotal = tx.transparentInputs.reduce((sum, input) => sum + input.value, 0);

    // Sum transparent outputs
    const outputTotal = tx.transparentOutputs.reduce((sum, output) => sum + output.value, 0);

    // Calculate fee
    const fee = inputTotal - outputTotal;

    // Check fee is sufficient
    if (fee < MINIMUM_FEE) {
      errors.push(`Fee too low: ${fee} zatoshi < ${MINIMUM_FEE} zatoshi`);
    }

    // Check balance is positive
    if (fee < 0) {
      errors.push(`Insufficient funds: inputs ${inputTotal} < outputs ${outputTotal}`);
    }

    // For shielded transactions, also check value balance
    if (tx.shieldedInputs || tx.shieldedOutputs) {
      // Value balance should balance shielded inputs and outputs
      // Simplified check - full implementation would verify actual shielded values
      // tx.valueBalance is used during transaction construction
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate shielded components
   */
  private validateShieldedComponents(tx: Transaction): ValidationResult {
    const errors: string[] = [];

    // Check shielded inputs
    if (tx.shieldedInputs) {
      for (let i = 0; i < tx.shieldedInputs.length; i++) {
        const input = tx.shieldedInputs[i];
        
        // Check nullifier is 32 bytes
        if (input.nullifier.length !== 32) {
          errors.push(`Invalid shielded input ${i}: nullifier must be 32 bytes`);
        }

        // Check value is positive
        if (input.value <= 0) {
          errors.push(`Invalid shielded input ${i}: value must be positive`);
        }
      }
    }

    // Check shielded outputs
    if (tx.shieldedOutputs) {
      for (let i = 0; i < tx.shieldedOutputs.length; i++) {
        const output = tx.shieldedOutputs[i];
        
        // Check address is present
        if (!output.address || output.address.length === 0) {
          errors.push(`Invalid shielded output ${i}: missing address`);
        }

        // Check value is positive
        if (output.value <= 0) {
          errors.push(`Invalid shielded output ${i}: value must be positive`);
        }

        // Check memo size if present
        if (output.memo && output.memo.length > 512) {
          errors.push(`Invalid shielded output ${i}: memo too large`);
        }
      }
    }

    // Check binding signature is present for shielded transactions
    if ((tx.shieldedInputs && tx.shieldedInputs.length > 0) ||
        (tx.shieldedOutputs && tx.shieldedOutputs.length > 0)) {
      if (!tx.bindingSig || tx.bindingSig.length !== 128) { // 64 bytes = 128 hex chars
        errors.push('Shielded transaction missing or invalid binding signature');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Estimate transaction size
   */
  private estimateTransactionSize(tx: Transaction): number {
    let size = 4; // version

    if (tx.version >= 4) {
      size += 4; // versionGroupId
    }

    // Transparent inputs
    size += this.compactSizeSize(tx.transparentInputs.length);
    for (const input of tx.transparentInputs) {
      size += 32 + 4; // hash + index
      size += this.compactSizeSize(input.scriptSig?.length || 0);
      size += (input.scriptSig?.length || 0) / 2; // hex to bytes
      size += 4; // sequence
    }

    // Transparent outputs
    size += this.compactSizeSize(tx.transparentOutputs.length);
    for (const output of tx.transparentOutputs) {
      size += 8; // value
      size += this.compactSizeSize(output.scriptPubKey.length);
      size += output.scriptPubKey.length / 2; // hex to bytes
    }

    // Shielded components
    if (tx.shieldedInputs || tx.shieldedOutputs) {
      size += this.compactSizeSize(tx.shieldedInputs?.length || 0);
      size += (tx.shieldedInputs?.length || 0) * (32 + 32 + 192 + 32 + 32); // inputs
      size += this.compactSizeSize(tx.shieldedOutputs?.length || 0);
      size += (tx.shieldedOutputs?.length || 0) * (32 + 32 + 32 + 580 + 80 + 192); // outputs
      size += 8; // valueBalance
      size += 64; // bindingSig
    }

    size += 4 + 4; // lockTime + expiryHeight

    return size;
  }

  /**
   * Calculate compact size encoding length
   */
  private compactSizeSize(value: number): number {
    if (value < 0xFD) return 1;
    if (value <= 0xFFFF) return 3;
    if (value <= 0xFFFFFFFF) return 5;
    return 9;
  }
}



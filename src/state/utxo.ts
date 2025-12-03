/**
 * UTXO Management
 * Manages Unspent Transaction Outputs for transparent addresses
 */

import type { UTXO } from '../types/index';

/**
 * UTXO with additional metadata
 */
export interface UTXOEntry extends UTXO {
  /** Block height where UTXO was confirmed */
  blockHeight: number;
  /** Timestamp when UTXO was added to cache */
  cachedAt: number;
  /** Whether UTXO is locked for pending transaction */
  locked: boolean;
  /** Transaction ID that locked this UTXO */
  lockedBy?: string;
}

/**
 * UTXO set for an address
 */
export interface AddressUTXOSet {
  address: string;
  utxos: Map<string, UTXOEntry>;
  lastUpdated: number;
  totalConfirmed: number;
  totalUnconfirmed: number;
}

/**
 * UTXO cache configuration
 */
export interface UTXOCacheConfig {
  /** Maximum number of UTXOs to cache per address */
  maxUtxosPerAddress: number;
  /** Cache TTL in milliseconds */
  ttlMs: number;
  /** Minimum confirmations for UTXO to be considered spendable */
  minConfirmations: number;
}

/**
 * UTXO selection strategy
 */
export type UTXOSelectionStrategy = 
  | 'largest-first'
  | 'smallest-first'
  | 'oldest-first'
  | 'newest-first'
  | 'random';

/**
 * UTXO selection result
 */
export interface UTXOSelectionResult {
  selected: UTXOEntry[];
  total: number;
  change: number;
  fee: number;
}

/**
 * Generate UTXO key for map storage
 */
function utxoKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

/**
 * UTXO Cache
 * 
 * Manages a cache of UTXOs for transparent addresses with:
 * - Automatic expiration
 * - UTXO locking for pending transactions
 * - Various selection strategies
 */
export class UTXOCache {
  private cache: Map<string, AddressUTXOSet> = new Map();
  private config: UTXOCacheConfig;

  constructor(config?: Partial<UTXOCacheConfig>) {
    this.config = {
      maxUtxosPerAddress: config?.maxUtxosPerAddress ?? 1000,
      ttlMs: config?.ttlMs ?? 60000, // 1 minute default
      minConfirmations: config?.minConfirmations ?? 1
    };
  }

  /**
   * Get UTXOs for an address
   */
  getUTXOs(address: string): UTXOEntry[] {
    const set = this.cache.get(address);
    if (!set) {
      return [];
    }

    // Check if cache is expired
    if (Date.now() - set.lastUpdated > this.config.ttlMs) {
      return [];
    }

    return Array.from(set.utxos.values());
  }

  /**
   * Get spendable UTXOs (not locked, sufficient confirmations)
   */
  getSpendableUTXOs(address: string, currentHeight: number): UTXOEntry[] {
    return this.getUTXOs(address).filter(utxo => {
      // Must not be locked
      if (utxo.locked) {
        return false;
      }

      // Must have minimum confirmations
      const confirmations = currentHeight - utxo.blockHeight + 1;
      if (confirmations < this.config.minConfirmations) {
        return false;
      }

      return true;
    });
  }

  /**
   * Update UTXOs for an address
   */
  updateUTXOs(address: string, utxos: UTXO[], currentHeight: number): void {
    let set = this.cache.get(address);
    if (!set) {
      set = {
        address,
        utxos: new Map(),
        lastUpdated: 0,
        totalConfirmed: 0,
        totalUnconfirmed: 0
      };
      this.cache.set(address, set);
    }

    // Clear existing UTXOs that aren't locked
    for (const [key, entry] of set.utxos) {
      if (!entry.locked) {
        set.utxos.delete(key);
      }
    }

    // Add new UTXOs
    let totalConfirmed = 0;
    let totalUnconfirmed = 0;

    for (const utxo of utxos) {
      const key = utxoKey(utxo.txid, utxo.vout);
      
      // Skip if already locked
      const existing = set.utxos.get(key);
      if (existing?.locked) {
        continue;
      }

      const entry: UTXOEntry = {
        ...utxo,
        blockHeight: currentHeight - utxo.confirmations + 1,
        cachedAt: Date.now(),
        locked: false
      };

      set.utxos.set(key, entry);

      if (utxo.confirmations >= this.config.minConfirmations) {
        totalConfirmed += utxo.amount;
      } else {
        totalUnconfirmed += utxo.amount;
      }
    }

    // Enforce max UTXOs limit
    if (set.utxos.size > this.config.maxUtxosPerAddress) {
      this.evictOldest(set, set.utxos.size - this.config.maxUtxosPerAddress);
    }

    set.lastUpdated = Date.now();
    set.totalConfirmed = totalConfirmed;
    set.totalUnconfirmed = totalUnconfirmed;
  }

  /**
   * Add a single UTXO
   */
  addUTXO(address: string, utxo: UTXO, currentHeight: number): void {
    let set = this.cache.get(address);
    if (!set) {
      set = {
        address,
        utxos: new Map(),
        lastUpdated: Date.now(),
        totalConfirmed: 0,
        totalUnconfirmed: 0
      };
      this.cache.set(address, set);
    }

    const key = utxoKey(utxo.txid, utxo.vout);
    const entry: UTXOEntry = {
      ...utxo,
      blockHeight: currentHeight - utxo.confirmations + 1,
      cachedAt: Date.now(),
      locked: false
    };

    set.utxos.set(key, entry);

    if (utxo.confirmations >= this.config.minConfirmations) {
      set.totalConfirmed += utxo.amount;
    } else {
      set.totalUnconfirmed += utxo.amount;
    }

    set.lastUpdated = Date.now();
  }

  /**
   * Remove a UTXO (when spent)
   */
  removeUTXO(address: string, txid: string, vout: number): boolean {
    const set = this.cache.get(address);
    if (!set) {
      return false;
    }

    const key = utxoKey(txid, vout);
    const entry = set.utxos.get(key);
    if (!entry) {
      return false;
    }

    set.utxos.delete(key);
    
    // Update totals
    if (entry.confirmations >= this.config.minConfirmations) {
      set.totalConfirmed -= entry.amount;
    } else {
      set.totalUnconfirmed -= entry.amount;
    }

    return true;
  }

  /**
   * Lock UTXOs for a pending transaction
   */
  lockUTXOs(
    address: string,
    utxos: Array<{ txid: string; vout: number }>,
    txid: string
  ): boolean {
    const set = this.cache.get(address);
    if (!set) {
      return false;
    }

    // Verify all UTXOs exist and aren't locked
    for (const utxo of utxos) {
      const key = utxoKey(utxo.txid, utxo.vout);
      const entry = set.utxos.get(key);
      if (!entry || entry.locked) {
        return false;
      }
    }

    // Lock all UTXOs
    for (const utxo of utxos) {
      const key = utxoKey(utxo.txid, utxo.vout);
      const entry = set.utxos.get(key)!;
      entry.locked = true;
      entry.lockedBy = txid;
    }

    return true;
  }

  /**
   * Unlock UTXOs (transaction failed or was replaced)
   */
  unlockUTXOs(address: string, txid: string): void {
    const set = this.cache.get(address);
    if (!set) {
      return;
    }

    for (const entry of set.utxos.values()) {
      if (entry.lockedBy === txid) {
        entry.locked = false;
        entry.lockedBy = undefined;
      }
    }
  }

  /**
   * Get balance for an address
   */
  getBalance(address: string): { confirmed: number; unconfirmed: number; total: number } {
    const set = this.cache.get(address);
    if (!set || Date.now() - set.lastUpdated > this.config.ttlMs) {
      return { confirmed: 0, unconfirmed: 0, total: 0 };
    }

    return {
      confirmed: set.totalConfirmed,
      unconfirmed: set.totalUnconfirmed,
      total: set.totalConfirmed + set.totalUnconfirmed
    };
  }

  /**
   * Check if cache is valid (not expired)
   */
  isCacheValid(address: string): boolean {
    const set = this.cache.get(address);
    if (!set) {
      return false;
    }
    return Date.now() - set.lastUpdated < this.config.ttlMs;
  }

  /**
   * Invalidate cache for an address
   */
  invalidate(address: string): void {
    this.cache.delete(address);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Evict oldest UTXOs from set
   */
  private evictOldest(set: AddressUTXOSet, count: number): void {
    const entries = Array.from(set.utxos.entries())
      .filter(([_, entry]) => !entry.locked)
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      set.utxos.delete(entries[i][0]);
    }
  }
}

/**
 * UTXO Selector
 * 
 * Implements various coin selection algorithms for choosing
 * UTXOs to spend in a transaction.
 */
export class UTXOSelector {
  private cache: UTXOCache;

  constructor(cache: UTXOCache) {
    this.cache = cache;
  }

  /**
   * Select UTXOs to cover an amount
   */
  select(
    address: string,
    amount: number,
    feeRate: number,
    currentHeight: number,
    strategy: UTXOSelectionStrategy = 'largest-first'
  ): UTXOSelectionResult {
    const spendable = this.cache.getSpendableUTXOs(address, currentHeight);
    
    if (spendable.length === 0) {
      throw new Error('No spendable UTXOs available');
    }

    // Sort by strategy
    const sorted = this.sortByStrategy(spendable, strategy);

    // Estimate fee for transaction
    const baseFee = this.estimateBaseFee(feeRate);
    const feePerInput = this.estimateFeePerInput(feeRate);
    const feePerOutput = this.estimateFeePerOutput(feeRate);

    // Select UTXOs
    const selected: UTXOEntry[] = [];
    let total = 0;
    let estimatedFee = baseFee + feePerOutput * 2; // 2 outputs (recipient + change)

    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.amount;
      estimatedFee += feePerInput;

      // Check if we have enough
      if (total >= amount + estimatedFee) {
        break;
      }
    }

    // Check if we have enough
    if (total < amount + estimatedFee) {
      throw new Error(
        `Insufficient funds: have ${total} zatoshi, need ${amount + estimatedFee} zatoshi`
      );
    }

    const change = total - amount - estimatedFee;

    return {
      selected,
      total,
      change,
      fee: estimatedFee
    };
  }

  /**
   * Select exact UTXOs (no change output)
   */
  selectExact(
    address: string,
    amount: number,
    feeRate: number,
    currentHeight: number,
    tolerance: number = 1000 // Allow up to 1000 zatoshi overpayment as fee
  ): UTXOSelectionResult | null {
    const spendable = this.cache.getSpendableUTXOs(address, currentHeight);
    
    // Try to find combination that matches exactly
    // This is a simplified version - full implementation would use
    // branch and bound algorithm
    const baseFee = this.estimateBaseFee(feeRate);
    const feePerInput = this.estimateFeePerInput(feeRate);
    const feePerOutput = this.estimateFeePerOutput(feeRate);

    // Sort by amount
    const sorted = [...spendable].sort((a, b) => b.amount - a.amount);

    // Try combinations (simplified greedy approach)
    for (let numInputs = 1; numInputs <= Math.min(sorted.length, 10); numInputs++) {
      const fee = baseFee + feePerOutput + (numInputs * feePerInput);
      const target = amount + fee;

      // Try to find combination summing to target
      const combination = this.findCombination(sorted, target, numInputs, tolerance);
      if (combination) {
        const total = combination.reduce((sum, u) => sum + u.amount, 0);
        return {
          selected: combination,
          total,
          change: 0,
          fee: total - amount
        };
      }
    }

    return null;
  }

  /**
   * Sort UTXOs by strategy
   */
  private sortByStrategy(
    utxos: UTXOEntry[],
    strategy: UTXOSelectionStrategy
  ): UTXOEntry[] {
    const sorted = [...utxos];

    switch (strategy) {
      case 'largest-first':
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case 'smallest-first':
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      case 'oldest-first':
        sorted.sort((a, b) => a.blockHeight - b.blockHeight);
        break;
      case 'newest-first':
        sorted.sort((a, b) => b.blockHeight - a.blockHeight);
        break;
      case 'random':
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        }
        break;
    }

    return sorted;
  }

  /**
   * Find combination of UTXOs summing to target
   */
  private findCombination(
    utxos: UTXOEntry[],
    target: number,
    maxInputs: number,
    tolerance: number
  ): UTXOEntry[] | null {
    // Simple greedy approach - for production, use branch and bound
    const selected: UTXOEntry[] = [];
    let total = 0;

    for (const utxo of utxos) {
      if (selected.length >= maxInputs) {
        break;
      }

      if (total + utxo.amount <= target + tolerance) {
        selected.push(utxo);
        total += utxo.amount;

        if (total >= target && total <= target + tolerance) {
          return selected;
        }
      }
    }

    return null;
  }

  /**
   * Estimate base fee (version, locktime, etc.)
   */
  private estimateBaseFee(feeRate: number): number {
    const baseSize = 10; // bytes
    return baseSize * feeRate;
  }

  /**
   * Estimate fee per input
   */
  private estimateFeePerInput(feeRate: number): number {
    const inputSize = 148; // P2PKH input size
    return inputSize * feeRate;
  }

  /**
   * Estimate fee per output
   */
  private estimateFeePerOutput(feeRate: number): number {
    const outputSize = 34; // P2PKH output size
    return outputSize * feeRate;
  }
}


/**
 * Transaction Tracking and Confirmation Management
 * Tracks broadcast transactions, their confirmations, and final status
 */

import { ZcashRpcClient } from './rpcClient.js';

/**
 * Broadcast transaction tracking status
 */
export enum BroadcastTransactionStatus {
  PENDING = 'pending',
  MEMPOOL = 'mempool',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  NOT_FOUND = 'not_found'
}

/**
 * Tracked transaction record
 */
export interface TrackedTransaction {
  txid: string;
  broadcastTime: number;
  status: BroadcastTransactionStatus;
  confirmations: number;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
  error?: string;
  lastCheckedAt: number;
}

/**
 * Transaction confirmation result
 */
export interface ConfirmationResult {
  txid: string;
  confirmed: boolean;
  confirmations: number;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
  finalStatus: BroadcastTransactionStatus;
}

/**
 * Transaction Tracker for monitoring broadcast transactions
 */
export class TransactionTracker {
  private rpcClient: ZcashRpcClient;
  private trackedTxs: Map<string, TrackedTransaction> = new Map();
  private confirmationCallbacks: Map<string, ((result: ConfirmationResult) => void)[]> = new Map();

  constructor(rpcClient: ZcashRpcClient) {
    this.rpcClient = rpcClient;
  }

  /**
   * Add a transaction to tracking
   */
  trackTransaction(txid: string): TrackedTransaction {
    if (this.trackedTxs.has(txid)) {
      return this.trackedTxs.get(txid)!;
    }

    const tracked: TrackedTransaction = {
      txid,
      broadcastTime: Date.now(),
      status: BroadcastTransactionStatus.MEMPOOL,
      confirmations: 0,
      lastCheckedAt: Date.now()
    };

    this.trackedTxs.set(txid, tracked);
    return tracked;
  }

  /**
   * Stop tracking a transaction
   */
  untrackTransaction(txid: string): void {
    this.trackedTxs.delete(txid);
    this.confirmationCallbacks.delete(txid);
  }

  /**
   * Get tracked transaction status
   */
  getTransactionStatus(txid: string): TrackedTransaction | null {
    return this.trackedTxs.get(txid) ?? null;
  }

  /**
   * Get all tracked transactions
   */
  getAllTrackedTransactions(): TrackedTransaction[] {
    return Array.from(this.trackedTxs.values());
  }

  /**
   * Check confirmation status of a transaction
   */
  async checkConfirmation(txid: string): Promise<ConfirmationResult> {
    const tracked = this.trackedTxs.get(txid);
    if (!tracked) {
      throw new Error(`Transaction ${txid} is not being tracked`);
    }

    try {
      // Try to get transaction info
      const txInfo = await this.rpcClient.getTransaction(txid).catch(() => null);

      if (txInfo && txInfo.confirmations !== undefined) {
        // Transaction is in a block
        tracked.status = txInfo.confirmations > 0 ? BroadcastTransactionStatus.CONFIRMED : BroadcastTransactionStatus.MEMPOOL;
        tracked.confirmations = txInfo.confirmations;
        tracked.blockHash = txInfo.blockhash;
        tracked.blockTime = txInfo.blocktime;

        // Extract block height from blockchain info if needed
        if (!tracked.blockHeight && txInfo.blockhash) {
          try {
            const block = await this.rpcClient.getBlock(txInfo.blockhash);
            tracked.blockHeight = block.height;
          } catch {
            // Could not get block height, continue with what we have
          }
        }
      } else {
        // Check mempool
        const mempoolTx = await this.rpcClient.getMempoolTransaction(txid).catch(() => null);
        if (mempoolTx) {
          tracked.status = BroadcastTransactionStatus.MEMPOOL;
          tracked.confirmations = 0;
        } else {
          tracked.status = BroadcastTransactionStatus.NOT_FOUND;
          tracked.confirmations = 0;
        }
      }
    } catch (error) {
      tracked.status = BroadcastTransactionStatus.FAILED;
      tracked.error = error instanceof Error ? error.message : String(error);
    }

    tracked.lastCheckedAt = Date.now();

    const result: ConfirmationResult = {
      txid,
      confirmed: tracked.confirmations > 0,
      confirmations: tracked.confirmations,
      blockHeight: tracked.blockHeight,
      blockHash: tracked.blockHash,
      blockTime: tracked.blockTime,
      finalStatus: tracked.status
    };

    // Call any registered callbacks
    const callbacks = this.confirmationCallbacks.get(txid) ?? [];
    for (const callback of callbacks) {
      try {
        callback(result);
      } catch (error) {
      }
    }

    return result;
  }

  /**
   * Wait for a transaction to be confirmed
   */
  async waitForConfirmation(
    txid: string,
    options?: {
      requiredConfirmations?: number;
      maxWaitMs?: number;
      pollIntervalMs?: number;
    }
  ): Promise<ConfirmationResult> {
    const requiredConfirmations = options?.requiredConfirmations ?? 1;
    const maxWaitMs = options?.maxWaitMs ?? 600000; // 10 minutes
    const pollIntervalMs = options?.pollIntervalMs ?? 5000; // 5 seconds

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.checkConfirmation(txid);

      if (result.confirmed && result.confirmations >= requiredConfirmations) {
        return result;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout reached
    const final = await this.checkConfirmation(txid);
    return {
      ...final,
      confirmed: false
    };
  }

  /**
   * Register a callback for when transaction is confirmed
   */
  onConfirmation(txid: string, callback: (result: ConfirmationResult) => void): () => void {
    if (!this.confirmationCallbacks.has(txid)) {
      this.confirmationCallbacks.set(txid, []);
    }
    this.confirmationCallbacks.get(txid)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.confirmationCallbacks.get(txid);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Poll all tracked transactions
   */
  async pollAllTransactions(): Promise<Map<string, ConfirmationResult>> {
    const results = new Map<string, ConfirmationResult>();

    for (const txid of this.trackedTxs.keys()) {
      try {
        const result = await this.checkConfirmation(txid);
        results.set(txid, result);
      } catch (error) {
        // Transaction polling error - continue with other transactions
      }
    }

    return results;
  }

  /**
   * Cleanup old transactions (older than specified duration)
   */
  cleanupOldTransactions(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [txid, tracked] of this.trackedTxs.entries()) {
      if (tracked.broadcastTime < cutoffTime && tracked.status === BroadcastTransactionStatus.CONFIRMED) {
        this.untrackTransaction(txid);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get summary statistics
   */
  getStatistics(): {
    totalTracked: number;
    pending: number;
    confirmed: number;
    failed: number;
    notFound: number;
  } {
    const stats = {
      totalTracked: this.trackedTxs.size,
      pending: 0,
      confirmed: 0,
      failed: 0,
      notFound: 0
    };

    for (const tracked of this.trackedTxs.values()) {
      if (tracked.status === BroadcastTransactionStatus.PENDING || tracked.status === BroadcastTransactionStatus.MEMPOOL) {
        stats.pending++;
      } else if (tracked.status === BroadcastTransactionStatus.CONFIRMED) {
        stats.confirmed++;
      } else if (tracked.status === BroadcastTransactionStatus.FAILED) {
        stats.failed++;
      } else if (tracked.status === BroadcastTransactionStatus.NOT_FOUND) {
        stats.notFound++;
      }
    }

    return stats;
  }

  /**
   * Verify a transaction is in a specific block
   */
  async verifyInBlock(txid: string, blockHash: string): Promise<boolean> {
    try {
      const result = await this.rpcClient.verifyTransactionInBlock(txid, blockHash);

      if (result) {
        const tracked = this.trackedTxs.get(txid);
        if (tracked) {
          tracked.blockHash = blockHash;
          tracked.status = BroadcastTransactionStatus.CONFIRMED;
        }
      }

      return result;
    } catch (error) {
      // Verification failed - return false to indicate transaction not found
      return false;
    }
  }

  /**
   * Export tracked transactions state (for persistence)
   */
  exportState(): TrackedTransaction[] {
    return Array.from(this.trackedTxs.values());
  }

  /**
   * Import tracked transactions state (from persistence)
   */
  importState(transactions: TrackedTransaction[]): void {
    for (const tx of transactions) {
      this.trackedTxs.set(tx.txid, tx);
    }
  }

  /**
   * Clear all tracking
   */
  clear(): void {
    this.trackedTxs.clear();
    this.confirmationCallbacks.clear();
  }
}

/**
 * Broadcast helper that combines sending and tracking
 */
export class BroadcastManager {
  private rpcClient: ZcashRpcClient;
  private tracker: TransactionTracker;

  constructor(rpcClient: ZcashRpcClient) {
    this.rpcClient = rpcClient;
    this.tracker = new TransactionTracker(rpcClient);
  }

  /**
   * Broadcast a transaction and automatically track it
   */
  async broadcastAndTrack(
    hexTx: string,
    options?: {
      allowHighFees?: boolean;
      trackingOptions?: {
        requiredConfirmations?: number;
        maxWaitMs?: number;
        pollIntervalMs?: number;
      };
    }
  ): Promise<{
    txid: string;
    tracked: boolean;
    trackingId: string;
  }> {
    // Validate before broadcast
    const isValid = await this.rpcClient.validateTransaction(hexTx);
    if (!isValid) {
      throw new Error('Transaction validation failed - invalid transaction format');
    }

    // Broadcast
    let txid: string;
    try {
      txid = await this.rpcClient.sendRawTransaction(hexTx, options?.allowHighFees);
    } catch (error) {
      throw new Error(`Broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Start tracking
    this.tracker.trackTransaction(txid);

    return {
      txid,
      tracked: true,
      trackingId: txid
    };
  }

  /**
   * Broadcast and wait for confirmation in one call
   */
  async broadcastAndWait(
    hexTx: string,
    options?: {
      allowHighFees?: boolean;
      requiredConfirmations?: number;
      maxWaitMs?: number;
      pollIntervalMs?: number;
    }
  ): Promise<ConfirmationResult> {
    const broadcast = await this.broadcastAndTrack(hexTx, {
      allowHighFees: options?.allowHighFees,
      trackingOptions: {
        requiredConfirmations: options?.requiredConfirmations ?? 1,
        maxWaitMs: options?.maxWaitMs ?? 600000,
        pollIntervalMs: options?.pollIntervalMs ?? 5000
      }
    });

    const result = await this.tracker.waitForConfirmation(broadcast.txid, {
      requiredConfirmations: options?.requiredConfirmations ?? 1,
      maxWaitMs: options?.maxWaitMs ?? 600000,
      pollIntervalMs: options?.pollIntervalMs ?? 5000
    });

    return result;
  }

  /**
   * Get tracker instance for more control
   */
  getTracker(): TransactionTracker {
    return this.tracker;
  }
}

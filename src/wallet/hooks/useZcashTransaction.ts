/**
 * React Hook: useZcashTransaction
 * 
 * Hook for building and sending Zcash transactions
 */

/**
 * This file requires React to be installed.
 * Copy this file to your Miden wallet project where React is available.
 */

// @ts-ignore - React types may not be available in SDK build
import { useState, useCallback } from 'react';
import type { TransactionParams, SignedTransaction } from '../../types/index';

/**
 * Hook return type
 */
export interface UseZcashTransactionReturn {
  /** Sending state */
  sending: boolean;
  
  /** Error state */
  error: Error | null;
  
  /** Last transaction hash */
  txHash: string | null;
  
  /** Build and sign transaction */
  buildAndSign: (
    midenAccountId: string,
    params: TransactionParams
  ) => Promise<SignedTransaction>;
  
  /** Broadcast transaction */
  broadcast: (tx: SignedTransaction) => Promise<string>;
  
  /** Send transaction (build, sign, and broadcast) */
  send: (
    midenAccountId: string,
    params: TransactionParams
  ) => Promise<string>;
  
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for managing Zcash transactions
 * 
 * @param zcashModule - Zcash module instance
 */
export function useZcashTransaction(
  zcashModule: any // ZcashModule type
): UseZcashTransactionReturn {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const buildAndSign = useCallback(async (
    midenAccountId: string,
    params: TransactionParams
  ): Promise<SignedTransaction> => {
    try {
      setSending(true);
      setError(null);

      const signedTx = await zcashModule.buildAndSignTransaction(
        midenAccountId,
        params
      );

      return signedTx;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [zcashModule]);

  const broadcast = useCallback(async (
    tx: SignedTransaction
  ): Promise<string> => {
    try {
      setSending(true);
      setError(null);

      const result = await zcashModule.broadcastTransaction(tx);
      setTxHash(result.hash);

      return result.hash;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [zcashModule]);

  const send = useCallback(async (
    midenAccountId: string,
    params: TransactionParams
  ): Promise<string> => {
    const signedTx = await buildAndSign(midenAccountId, params);
    return await broadcast(signedTx);
  }, [buildAndSign, broadcast]);

  const reset = useCallback(() => {
    setError(null);
    setTxHash(null);
    setSending(false);
  }, []);

  return {
    sending,
    error,
    txHash,
    buildAndSign,
    broadcast,
    send,
    reset
  };
}


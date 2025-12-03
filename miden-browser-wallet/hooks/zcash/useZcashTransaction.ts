/**
 * React Hook: useZcashTransaction
 * 
 * Copy this file to: miden-wallet/src/modules/zcash/hooks/useZcashTransaction.ts
 */

import { useState, useCallback } from 'react';
import type { TransactionParams, SignedTransaction } from '@miden/zcash-integration/wallet';
import type { ZcashModule } from '@miden/zcash-integration/wallet';

export interface UseZcashTransactionReturn {
  sending: boolean;
  error: Error | null;
  txHash: string | null;
  buildAndSign: (
    midenAccountId: string,
    params: TransactionParams
  ) => Promise<SignedTransaction>;
  broadcast: (tx: SignedTransaction) => Promise<string>;
  send: (
    midenAccountId: string,
    params: TransactionParams
  ) => Promise<string>;
  reset: () => void;
}

export function useZcashTransaction(
  zcashModule: ZcashModule
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


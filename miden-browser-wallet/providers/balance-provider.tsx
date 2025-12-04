"use client";

import { useEffect, useState, useRef, type ReactNode, createContext, useContext } from "react";
import { useStore } from "zustand";
import { type BalanceState, createBalanceStore } from "@/store/balance";
import { PRIVATE_NOTE_TRANSPORT_URL, RPC_ENDPOINT } from "@/lib/constants";
import { useMidenSdkStore } from "./sdk-provider";

export type Balancestore = ReturnType<typeof createBalanceStore>;

export const MidenSdkStoreContext = createContext<Balancestore | undefined>(
  undefined,
);

export interface BalanceStoreProviderProps {
  children: ReactNode;
}

export const BalanceProvider = ({ children }: BalanceStoreProviderProps) => {
  const storeRef = useRef<Balancestore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createBalanceStore();
  }

  return (
    <MidenSdkStoreContext.Provider value={storeRef.current}>
      {children}
    </MidenSdkStoreContext.Provider>
  );
};

export const useBalanceStore = <T,>(
  selector: (store: BalanceState) => T,
): T => {
  const midenSdkStoreContext = useContext(MidenSdkStoreContext);

  if (!midenSdkStoreContext) {
    throw new Error(`useCounterStore must be used within CounterStoreProvider`);
  }

  return useStore(midenSdkStoreContext, selector);
};

export const useObserveBalance = () => {
  const blockNum = useMidenSdkStore((state) => state.blockNum);
  const account = useMidenSdkStore((state) => state.account);
  const loadBalance = useBalanceStore((state) => state.loadBalance);
  const [client, setClient] = useState<any | null>(null);
  const lastLoadRef = useRef<{ blockNum: number; account: string; timestamp: number } | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const initClient = async () => {
      const { WebClient } = await import("@demox-labs/miden-sdk");
      const clientInstance = await WebClient.createClient(
        RPC_ENDPOINT,
        PRIVATE_NOTE_TRANSPORT_URL,
      );
      setClient(clientInstance);
    };
    initClient();
    return () => {
      if (client) {
        client.terminate();
      }
      setClient(null);
    };
  }, []);

  useEffect(() => {
    if (!client || !account) {
      return;
    }

    // Prevent concurrent loads
    if (loadingRef.current) {
      return;
    }

    // Debounce: Only load if blockNum changed significantly (every 10 blocks) or account changed
    // Or if it's been more than 30 seconds since last load
    const now = Date.now();
    const lastLoad = lastLoadRef.current;
    const shouldLoad = 
      !lastLoad || // First load
      lastLoad.account !== account || // Account changed
      (blockNum - lastLoad.blockNum) >= 10 || // Significant block change (10 blocks)
      (now - lastLoad.timestamp) > 30000; // More than 30 seconds since last load

    if (shouldLoad) {
      loadingRef.current = true;
      lastLoadRef.current = { blockNum, account, timestamp: now };
      
      loadBalance(client, account)
        .catch((err) => {
          // Silently handle errors to prevent console spam
          console.debug('Balance load error (suppressed):', err);
        })
        .finally(() => {
          loadingRef.current = false;
        });
    }
  }, [client, blockNum, account, loadBalance]);
};

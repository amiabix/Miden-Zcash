"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
// Note: Alert component import - adjust path if needed
import { Shield, Eye, Lock, ArrowRight } from "lucide-react";

interface ScannedTransaction {
  txid: string;
  blockHeight: number;
  timestamp: number;
  notes: {
    value: number;
    memo?: string;
    address: string;
    isOutgoing: boolean;
  }[];
  totalValue: number;
}

export default function ZcashExplorerPage() {
  const [viewingKey, setViewingKey] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [transactions, setTransactions] = useState<ScannedTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [rpcConnected, setRpcConnected] = useState(false);

  useEffect(() => {
    // Check RPC connection
    const checkRPC = async () => {
      try {
        const { getZcashModule, initializeZcash } = await import("@/lib/zcash/zcashService");
        
        // Initialize if needed
        let module = getZcashModule();
        if (!module) {
          try {
            await initializeZcash();
            module = getZcashModule();
          } catch (initError) {
            console.warn('Failed to initialize Zcash for explorer:', initError);
            return;
          }
        }
        
        if (module && typeof module.isRPCConnected === 'function') {
          setRpcConnected(module.isRPCConnected());
        }
      } catch (e) {
        console.warn('RPC check failed:', e);
      }
    };
    checkRPC();
  }, []);

  const handleScan = async () => {
    if (!viewingKey || viewingKey.trim().length === 0) {
      toast.error("Please enter a viewing key");
      return;
    }

    if (!rpcConnected) {
      toast.error("RPC connection required. Please set up a local Zcash node.");
      return;
    }

    setScanning(true);
    setError(null);
    setTransactions([]);
    setBalance(0);

    try {
      const { getZcashModule } = await import("@/lib/zcash/zcashService");
      const module = getZcashModule();
      if (!module) {
        throw new Error('Zcash module not available');
      }

      const provider = module.getProvider();
      const rpcClient = (provider as any).rpcClient;

      // Get current block height
      const currentHeight = await rpcClient.getBlockCount();
      const startHeight = Math.max(1, currentHeight - 1000); // Scan last 1000 blocks

      // Convert viewing key from hex string
      const viewingKeyBytes = new Uint8Array(
        viewingKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );

      if (viewingKeyBytes.length !== 32) {
        throw new Error('Invalid viewing key length. Expected 64 hex characters (32 bytes).');
      }

      // Import note scanner
      const { NoteScanner } = await import('@miden/zcash-integration/shielded');
      const { NoteCache } = await import('@miden/zcash-integration/shielded');

      const cache = new NoteCache();
      const scanner = new NoteScanner(
        { ivk: viewingKeyBytes },
        cache,
        {
          batchSize: 10,
          scanOutgoing: true,
          onProgress: (prog) => {
            setProgress({ current: prog.currentBlock, total: prog.totalBlocks });
          }
        }
      );

      // Helper to get block from RPC
      const getBlock = async (height: number) => {
        try {
          const blockHash = await rpcClient.getBlockHash(height);
          const block = await rpcClient.getTransaction(blockHash, true); // Get full block data
          // Alternative: use getblock RPC directly
          const blockData = await (rpcClient as any).sendRequest('getblock', [blockHash, 2]);
          return { ...blockData, height };
        } catch (e) {
          console.warn(`Failed to get block ${height}:`, e);
          return null;
        }
      };

      // Scan blocks
      const foundNotes: any[] = [];
      const totalBlocks = currentHeight - startHeight + 1;
      
      for (let height = startHeight; height <= currentHeight; height += 10) {
        const endHeight = Math.min(height + 9, currentHeight);
        setProgress({ current: height - startHeight, total: totalBlocks });
        
        // Get blocks from RPC
        const blocks = [];
        for (let h = height; h <= endHeight; h++) {
          const block = await getBlock(h);
          if (!block) continue;
          
          // Extract shielded outputs from block
          const blockNotes: any[] = [];
          const txids: string[] = [];
          
          for (const tx of block.tx || []) {
            const txid = typeof tx === 'string' ? tx : tx.txid || '';
            txids.push(txid);
            
            // Handle different block formats
            const txData = typeof tx === 'object' ? tx : null;
            if (txData?.vShieldedOutput && txData.vShieldedOutput.length > 0) {
              for (const output of txData.vShieldedOutput) {
                try {
                  blockNotes.push({
                    cmu: typeof output.cmu === 'string' 
                      ? new Uint8Array(Buffer.from(output.cmu, 'hex'))
                      : new Uint8Array(output.cmu),
                    ephemeralKey: typeof output.epk === 'string'
                      ? new Uint8Array(Buffer.from(output.epk, 'hex'))
                      : new Uint8Array(output.epk),
                    ciphertext: typeof output.encCiphertext === 'string'
                      ? new Uint8Array(Buffer.from(output.encCiphertext, 'hex'))
                      : new Uint8Array(output.encCiphertext)
                  });
                } catch (e) {
                  console.warn('Failed to parse output:', e);
                }
              }
            }
          }

          if (blockNotes.length > 0) {
            blocks.push({
              height: h,
              hash: typeof block.hash === 'string' ? block.hash : '',
              transactions: txids.map((txid, idx) => ({
                txid,
                outputs: blockNotes,
                nullifiers: []
              }))
            });
          }
        }

        if (blocks.length > 0) {
          const scanned = await scanner.scanBlocks(blocks, height, endHeight);
          foundNotes.push(...scanned);
        }
      }

      // Group notes by transaction
      const txMap = new Map<string, ScannedTransaction>();
      for (const note of foundNotes) {
        const txid = note.txid || 'unknown';
        if (!txMap.has(txid)) {
          txMap.set(txid, {
            txid,
            blockHeight: note.blockHeight,
            timestamp: Date.now() - (currentHeight - note.blockHeight) * 75 * 1000, // Approximate
            notes: [],
            totalValue: 0
          });
        }
        const tx = txMap.get(txid)!;
        tx.notes.push({
          value: note.note.value,
          memo: note.note.memo,
          address: note.note.address || '',
          isOutgoing: note.isOutgoing || false
        });
        tx.totalValue += note.note.value;
      }

      const txs = Array.from(txMap.values()).sort((a, b) => b.blockHeight - a.blockHeight);
      setTransactions(txs);
      
      const totalBalance = txs.reduce((sum, tx) => 
        sum + tx.notes.filter(n => !n.isOutgoing).reduce((s, n) => s + n.value, 0) -
        tx.notes.filter(n => n.isOutgoing).reduce((s, n) => s + n.value, 0), 0
      );
      setBalance(totalBalance);

      toast.success(`Found ${txs.length} transactions with ${foundNotes.length} notes`);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to scan transactions';
      setError(errorMsg);
      toast.error(errorMsg);
      console.error('Scan error:', err);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Zcash Shielded Transaction Explorer
          </h1>
          <p className="text-muted-foreground">
            View your shielded transactions using your viewing key. All decryption happens client-side - your viewing key never leaves your device.
          </p>
        </div>

        {!rpcConnected && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ RPC connection required. Please set up a local Zcash node to scan transactions.
                See <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">SETUP_LOCAL_NODE.md</code> for instructions.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Enter Viewing Key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="viewing-key">Incoming Viewing Key (IVK)</Label>
              <Input
                id="viewing-key"
                type="text"
                placeholder="Enter 64-character hex viewing key"
                value={viewingKey}
                onChange={(e) => setViewingKey(e.target.value)}
                disabled={scanning}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Your viewing key allows you to decrypt shielded transactions without exposing your spending key.
                This key never leaves your browser.
              </p>
            </div>

            <Button 
              onClick={handleScan} 
              disabled={scanning || !rpcConnected || !viewingKey}
              className="w-full"
            >
              {scanning ? (
                <>
                  <Lock className="w-4 h-4 mr-2 animate-spin" />
                  Scanning Blockchain...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Scan Transactions
                </>
              )}
            </Button>

            {progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Scanning blocks...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
            <CardContent className="p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </CardContent>
          </Card>
        )}

        {balance > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Shielded Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {balance / 100000000} ZEC
              </p>
              <p className="text-sm text-muted-foreground">
                {balance} zatoshi
              </p>
            </CardContent>
          </Card>
        )}

        {transactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Transactions ({transactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((tx) => (
                  <div key={tx.txid} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-mono text-sm break-all">{tx.txid}</p>
                        <p className="text-xs text-muted-foreground">
                          Block {tx.blockHeight} • {new Date(tx.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${tx.totalValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.totalValue > 0 ? '+' : ''}{tx.totalValue / 100000000} ZEC
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      {tx.notes.map((note, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <ArrowRight className={`w-4 h-4 ${note.isOutgoing ? 'text-red-500 rotate-180' : 'text-green-500'}`} />
                          <span className={note.isOutgoing ? 'text-red-600' : 'text-green-600'}>
                            {note.isOutgoing ? '-' : '+'}{note.value / 100000000} ZEC
                          </span>
                          {note.memo && (
                            <span className="text-muted-foreground text-xs">
                              • Memo: {note.memo}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {scanning && transactions.length === 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Shield, Eye, Lock, ArrowRight, Download, ExternalLink, Key } from "lucide-react";
import { useZcash } from "@/providers/zcash-provider";

interface ScannedTransaction {
  txid: string;
  blockHeight: number;
  timestamp: number;
  notes: {
    value: number;
    memo?: string;
    address: string;
    isOutgoing: boolean;
    spent: boolean;
    commitment: string;
  }[];
  nullifiers: string[];
  totalValue: number;
  netValue: number;
}

export default function ZcashExplorerPage() {
  const { module, account, isRPCConnected } = useZcash();
  const [viewingKey, setViewingKey] = useState<string>("");
  const [scanRange, setScanRange] = useState<'recent' | 'custom' | 'full'>('recent');
  const [customStartHeight, setCustomStartHeight] = useState<string>("");
  const [customEndHeight, setCustomEndHeight] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [transactions, setTransactions] = useState<ScannedTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [spendableBalance, setSpendableBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; notesFound: number } | null>(null);
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number>(0);
  const [decryptionStats, setDecryptionStats] = useState<{
    attempts: number;
    successes: number;
    failures: number;
    successRate: string;
  } | null>(null);

  useEffect(() => {
    const checkRPC = async () => {
      if (!module || !isRPCConnected) return;
      
      try {
        const provider = module.getProvider();
        const rpcClient = (provider as any).rpcClient;
        const height = await rpcClient.getBlockCount();
        setCurrentBlockHeight(height);
      } catch (e) {
        console.warn('Failed to get block height:', e);
      }
    };
    
    checkRPC();
  }, [module, isRPCConnected]);

  useEffect(() => {
    if (account?.viewingKey) {
      const viewingKeyHex = Array.from(account.viewingKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      setViewingKey(viewingKeyHex);
    }
  }, [account]);

  const handleScan = async () => {
    if (!viewingKey || viewingKey.trim().length === 0) {
      toast.error("Please enter a viewing key");
      return;
    }

    if (!isRPCConnected || !module) {
      toast.error("RPC connection required. Please set up a local Zcash node.");
      return;
    }

    setScanning(true);
    setError(null);
    setTransactions([]);
    setBalance(0);
    setSpendableBalance(0);

    try {
      const provider = module.getProvider();
      const rpcClient = (provider as any).rpcClient;

      const currentHeight = await rpcClient.getBlockCount();
      setCurrentBlockHeight(currentHeight);

      let startHeight: number;
      let endHeight: number = currentHeight;

      if (scanRange === 'recent') {
        startHeight = Math.max(1, currentHeight - 1000);
      } else if (scanRange === 'custom') {
        const start = parseInt(customStartHeight);
        const end = parseInt(customEndHeight);
        if (isNaN(start) || isNaN(end) || start < 1 || end > currentHeight || start > end) {
          toast.error('Invalid block range');
          setScanning(false);
          return;
        }
        startHeight = start;
        endHeight = end;
      } else {
        startHeight = 1;
      }

      const viewingKeyHex = viewingKey.trim().replace(/^0x/, '');
      if (viewingKeyHex.length !== 64) {
        throw new Error('Invalid viewing key length. Expected 64 hex characters (32 bytes).');
      }

      const viewingKeyBytes = new Uint8Array(
        viewingKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );

      if (viewingKeyBytes.length !== 32) {
        throw new Error('Invalid viewing key format');
      }

      const { NoteScanner, NoteCache, ShieldedStateSynchronizer } = await import('@miden/zcash-integration/shielded');
      const { hexToBytes, bytesToHex } = await import('@miden/zcash-integration/utils');

      const cache = new NoteCache();
      const scanner = new NoteScanner(
        { ivk: viewingKeyBytes },
        cache,
        {
          batchSize: 100,
          scanOutgoing: false,
          onProgress: (prog) => {
            setProgress({ 
              current: prog.currentHeight || 0, 
              total: prog.endHeight || endHeight,
              notesFound: prog.notesFound || 0
            });
          }
        }
      );

      const synchronizer = new ShieldedStateSynchronizer(scanner, cache);
      synchronizer.setRpcClient(rpcClient);

      const address = account?.zAddress || 'unknown';
      await synchronizer.initialize(address);

      const totalBlocks = endHeight - startHeight + 1;
      let notesFound = 0;
      const foundTransactions = new Map<string, ScannedTransaction>();
      const spentNullifiers = new Set<string>();
      
      // Create Merkle tree for witness generation
      const { IncrementalMerkleTree } = await import('@miden/zcash-integration/shielded');
      const merkleTree = new IncrementalMerkleTree(32);

      for (let height = startHeight; height <= endHeight; height += 100) {
        const batchEnd = Math.min(height + 99, endHeight);
        setProgress({ 
          current: height - startHeight, 
          total: totalBlocks,
          notesFound 
        });

        const blockHash = await rpcClient.getBlockHash(height);
        const block = await rpcClient.getBlock(blockHash, 2);

        const blockTransactions: any[] = [];

        for (const tx of block.tx || []) {
          const txid = typeof tx === 'string' ? tx : tx.txid;
          if (!txid) continue;

          try {
            const txData = await rpcClient.getRawTransaction(txid, true);

            const outputs: any[] = [];
            const nullifiers: Uint8Array[] = [];

            if (txData.vShieldedOutput && txData.vShieldedOutput.length > 0) {
              for (const output of txData.vShieldedOutput) {
                const encCiphertextHex = output.encCiphertext || '';
                const encCiphertext = hexToBytes(encCiphertextHex);
                
                // Zcash RPC returns full encCiphertext (580 bytes: 564 encrypted + 16 tag)
                // For compact notes, we need 52 bytes (36 encrypted + 16 tag)
                // Extract compact format: first 36 bytes of encrypted data + last 16 bytes (tag)
                // OR use full format if available
                let compactCiphertext: Uint8Array;
                if (encCiphertext.length >= 580) {
                  // Full format: extract compact portion
                  // Compact = first 36 bytes of encrypted data + last 16 bytes (tag)
                  const encryptedData = encCiphertext.slice(0, 564);
                  const authTag = encCiphertext.slice(564, 580);
                  compactCiphertext = new Uint8Array(52);
                  compactCiphertext.set(encryptedData.slice(0, 36), 0);
                  compactCiphertext.set(authTag, 36);
                } else if (encCiphertext.length === 52) {
                  // Already in compact format
                  compactCiphertext = encCiphertext;
                } else {
                  // Invalid length, skip this output
                  console.warn(`Invalid encCiphertext length: ${encCiphertext.length}, expected 52 or 580`);
                  continue;
                }
                
                outputs.push({
                  cmu: hexToBytes(output.cmu || output.cm || ''),
                  ephemeralKey: hexToBytes(output.ephemeralKey || output.epk || ''),
                  ciphertext: compactCiphertext,
                  encCiphertext: encCiphertext,
                  outCiphertext: hexToBytes(output.outCiphertext || ''),
                  cv: hexToBytes(output.cv || '')
                });
              }
            }

            if (txData.vShieldedSpend && txData.vShieldedSpend.length > 0) {
              for (const spend of txData.vShieldedSpend) {
                const nf = hexToBytes(spend.nullifier || spend.nf || '');
                nullifiers.push(nf);
                spentNullifiers.add(bytesToHex(nf));
              }
            }

            if (outputs.length > 0 || nullifiers.length > 0) {
              blockTransactions.push({
                txid,
                outputs,
                nullifiers
              });
            }
          } catch (txError) {
            console.warn(`Failed to process transaction ${txid}:`, txError);
          }
        }

        if (blockTransactions.length > 0) {
          const blocks = [{
            height,
            hash: blockHash,
            transactions: blockTransactions
          }];

          const scannedNotes = await scanner.scanBlocks(blocks, height, batchEnd, merkleTree);
          notesFound += scannedNotes.length;

          for (const scannedNote of scannedNotes) {
            // Get txid from the block transaction data
            const txid = blockTransactions.find(tx => 
              tx.outputs.some((out: any, idx: number) => 
                idx === scannedNote.outputIndex
              )
            )?.txid || 'unknown';
            if (!foundTransactions.has(txid)) {
              foundTransactions.set(txid, {
                txid,
                blockHeight: scannedNote.blockHeight,
                timestamp: block.time ? block.time * 1000 : Date.now() - (currentHeight - scannedNote.blockHeight) * 75 * 1000,
                notes: [],
                nullifiers: [],
                totalValue: 0,
                netValue: 0
              });
            }

            const tx = foundTransactions.get(txid)!;
            const nullifierHex = bytesToHex(scannedNote.note.nullifier);
            const isSpent = spentNullifiers.has(nullifierHex) || scannedNote.note.spent;

            tx.notes.push({
              value: scannedNote.note.value,
              memo: scannedNote.note.memo,
              address: scannedNote.note.address || '',
              isOutgoing: scannedNote.isOutgoing || false,
              spent: isSpent,
              commitment: bytesToHex(scannedNote.note.cmu)
            });
          }

          for (const txData of blockTransactions) {
            if (txData.nullifiers.length > 0) {
              const tx = foundTransactions.get(txData.txid);
              if (tx) {
                tx.nullifiers = txData.nullifiers.map((nf: Uint8Array) => bytesToHex(nf));
              }
            }
          }
        }
      }

      const txs = Array.from(foundTransactions.values()).map(tx => {
        tx.totalValue = tx.notes.reduce((sum, n) => sum + (n.isOutgoing ? -n.value : n.value), 0);
        tx.netValue = tx.notes
          .filter(n => !n.spent)
          .reduce((sum, n) => sum + (n.isOutgoing ? -n.value : n.value), 0);
        return tx;
      }).sort((a, b) => b.blockHeight - a.blockHeight);

      setTransactions(txs);

      const total = txs.reduce((sum, tx) => 
        sum + tx.notes
          .filter(n => !n.isOutgoing && !n.spent)
          .reduce((s, n) => s + n.value, 0) -
        tx.notes
          .filter(n => n.isOutgoing)
          .reduce((s, n) => s + n.value, 0), 0
      );
      
      const spendable = txs.reduce((sum, tx) => 
        sum + tx.notes
          .filter(n => !n.isOutgoing && !n.spent)
          .reduce((s, n) => s + n.value, 0), 0
      );

      setBalance(total);
      setSpendableBalance(spendable);

      // Get decryption statistics
      const stats = scanner.getDecryptionStats();
      const successRate = stats.attempts > 0 ? ((stats.successes / stats.attempts) * 100).toFixed(1) : '0';
      
      // Analyze failure reasons for nonce-related issues
      const nonceMismatchCount = Array.from(stats.failureReasons.entries())
        .filter(([reason]) => reason.includes('Nonce mismatch'))
        .reduce((sum, [, count]) => sum + count, 0);
      
      setDecryptionStats({
        attempts: stats.attempts,
        successes: stats.successes,
        failures: stats.failures,
        successRate: `${successRate}%`
      });
      
      if (stats.attempts > 0) {
        const failureReasonsObj = Object.fromEntries(stats.failureReasons);
        console.log('Decryption Statistics:', {
          attempts: stats.attempts,
          successes: stats.successes,
          failures: stats.failures,
          successRate: `${successRate}%`,
          failureReasons: failureReasonsObj,
          nonceMismatches: nonceMismatchCount,
          note: nonceMismatchCount > 0 
            ? 'Some notes decrypted but nonce derivation may be incorrect. See NONCE_DERIVATION_DOCUMENTATION.md'
            : 'All successful decryptions verified nonce matches spec'
        });
        
        if (nonceMismatchCount > 0) {
          toast.warning(
            `${nonceMismatchCount} notes decrypted but nonce verification failed. ` +
            `Nonce derivation may be using fallback strategy. Success rate: ${successRate}%`
          );
        } else if (stats.failures > 0 && stats.failures > stats.successes) {
          toast.warning(`Low decryption success rate: ${successRate}%. ${stats.failures} failures. Check nonce derivation.`);
        } else if (parseFloat(successRate) < 50) {
          toast.error(`Very low success rate: ${successRate}%. Nonce derivation likely incorrect. See documentation.`);
        }
      }

      toast.success(`Found ${txs.length} transactions with ${notesFound} notes`);
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

  const handleUseWalletKey = () => {
    if (account?.viewingKey) {
      const viewingKeyHex = Array.from(account.viewingKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      setViewingKey(viewingKeyHex);
      toast.success('Viewing key loaded from wallet');
    } else {
      toast.error('No viewing key available in wallet');
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


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Viewing Key Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="viewing-key">Incoming Viewing Key (IVK)</Label>
                {account?.viewingKey && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUseWalletKey}
                    disabled={scanning}
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Use Wallet Key
                  </Button>
                )}
              </div>
              <Input
                id="viewing-key"
                type="text"
                placeholder="Enter 64-character hex viewing key"
                value={viewingKey}
                onChange={(e) => {
                  const val = e.target.value.trim().replace(/^0x/, '');
                  setViewingKey(val);
                }}
                disabled={scanning}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Your viewing key allows you to decrypt shielded transactions without exposing your spending key.
                This key never leaves your browser. All decryption is performed client-side.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Scan Range</Label>
              <select
                value={scanRange}
                onChange={(e) => setScanRange(e.target.value as 'recent' | 'custom' | 'full')}
                disabled={scanning}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="recent">Recent (last 1000 blocks)</option>
                <option value="custom">Custom Range</option>
                <option value="full">Full Blockchain</option>
              </select>
            </div>

            {scanRange === 'custom' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Height</Label>
                  <Input
                    type="number"
                    value={customStartHeight}
                    onChange={(e) => setCustomStartHeight(e.target.value)}
                    placeholder="1"
                    disabled={scanning}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Height</Label>
                  <Input
                    type="number"
                    value={customEndHeight}
                    onChange={(e) => setCustomEndHeight(e.target.value)}
                    placeholder={currentBlockHeight.toString()}
                    disabled={scanning}
                    max={currentBlockHeight}
                  />
                </div>
              </div>
            )}

            {scanRange === 'full' && currentBlockHeight > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Will scan from block 1 to block {currentBlockHeight.toLocaleString()} ({currentBlockHeight.toLocaleString()} blocks).
                  This may take a significant amount of time.
                </p>
              </div>
            )}

            <Button 
              onClick={handleScan} 
              disabled={scanning || !isRPCConnected || !viewingKey || (scanRange === 'custom' && (!customStartHeight || !customEndHeight))}
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
                  <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} ({progress.notesFound} notes found)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
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

        {decryptionStats && decryptionStats.attempts > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Decryption Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Attempts</p>
                  <p className="text-2xl font-bold">{decryptionStats.attempts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Success Rate</p>
                  <p className={`text-2xl font-bold ${parseFloat(decryptionStats.successRate) < 50 ? 'text-red-600' : parseFloat(decryptionStats.successRate) < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {decryptionStats.successRate}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Successful</p>
                  <p className="text-xl font-semibold text-green-600">{decryptionStats.successes.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Failed</p>
                  <p className="text-xl font-semibold text-red-600">{decryptionStats.failures.toLocaleString()}</p>
                </div>
              </div>
              {decryptionStats.failures > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-200 dark:border-yellow-800">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    {decryptionStats.failures > decryptionStats.successes 
                      ? 'Warning: High failure rate. Nonce derivation may be incorrect. See NONCE_DERIVATION_DOCUMENTATION.md for details.'
                      : 'Some notes failed to decrypt. This may be normal if notes are not for this viewing key.'}
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    <strong>Status:</strong> Nonce derivation is unproven and requires validation with Zcash test vectors.
                    Current implementation uses fallback strategies that may not match the Zcash specification.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(balance > 0 || spendableBalance > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Shielded Balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-2xl font-bold">
                  {(spendableBalance / 100000000).toFixed(8)} ZEC
                </p>
                <p className="text-sm text-muted-foreground">
                  Spendable: {spendableBalance.toLocaleString()} zatoshi
                </p>
              </div>
              {balance !== spendableBalance && (
                <div className="pt-2 border-t">
                  <p className="text-lg font-semibold text-muted-foreground">
                    Total: {(balance / 100000000).toFixed(8)} ZEC
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {balance.toLocaleString()} zatoshi (includes spent notes)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {transactions.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Transactions ({transactions.length})</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const data = JSON.stringify(transactions, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `zcash-transactions-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((tx) => (
                  <div key={tx.txid} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm break-all">{tx.txid}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Block {tx.blockHeight.toLocaleString()} • {new Date(tx.timestamp).toLocaleString()}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <a
                            href={`https://testnet.cipherscan.app/tx/${tx.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View on CipherScan
                          </a>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className={`font-semibold ${tx.netValue > 0 ? 'text-green-600' : tx.netValue < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {tx.netValue > 0 ? '+' : ''}{(tx.netValue / 100000000).toFixed(8)} ZEC
                        </p>
                        {tx.totalValue !== tx.netValue && (
                          <p className="text-xs text-muted-foreground">
                            Total: {(tx.totalValue / 100000000).toFixed(8)} ZEC
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t">
                      {tx.notes.map((note, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <ArrowRight className={`w-4 h-4 ${note.isOutgoing ? 'text-red-500 rotate-180' : 'text-green-500'}`} />
                          <span className={note.isOutgoing ? 'text-red-600' : 'text-green-600'}>
                            {note.isOutgoing ? '-' : '+'}{(note.value / 100000000).toFixed(8)} ZEC
                          </span>
                          {note.spent && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              Spent
                            </span>
                          )}
                          {note.memo && (
                            <span className="text-muted-foreground text-xs">
                              • Memo: {note.memo}
                            </span>
                          )}
                        </div>
                      ))}
                      {tx.nullifiers.length > 0 && (
                        <div className="text-xs text-muted-foreground pt-1">
                          <span className="font-semibold">Spent notes:</span> {tx.nullifiers.length} nullifier{tx.nullifiers.length !== 1 ? 's' : ''}
                        </div>
                      )}
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

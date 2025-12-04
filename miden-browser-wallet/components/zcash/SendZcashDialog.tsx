"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// Select component - using native select for now
import { toast } from 'sonner';
import { getZcashModule } from '@/lib/zcash/zcashService';
import { useZcashTransaction } from '@/hooks/zcash/useZcashTransaction';
import { Send, Loader2 } from 'lucide-react';

// Import validation from SDK
let validateAddressSDK: any = null;
let isAddressForNetworkSDK: any = null;

interface SendZcashDialogProps {
  open: boolean;
  onClose: () => void;
  fromAddress?: string;
  fromAddressType?: 'transparent' | 'shielded';
  tAddress?: string;
  zAddress?: string;
  transparentBalance?: number;
  shieldedBalance?: number;
  midenAccountId?: string;
}

export function SendZcashDialog({ 
  open, 
  onClose, 
  fromAddress,
  fromAddressType,
  tAddress,
  zAddress,
  transparentBalance = 0,
  shieldedBalance = 0,
  midenAccountId 
}: SendZcashDialogProps) {
  const [zcashModule, setZcashModule] = useState<any>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [fromType, setFromType] = useState<'transparent' | 'shielded'>(
    fromAddressType || (fromAddress?.startsWith('t') || fromAddress?.startsWith('tm') ? 'transparent' : 'shielded') || 'transparent'
  );
  const [toType, setToType] = useState<'transparent' | 'shielded'>('transparent');
  const [fee, setFee] = useState('0.0001');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    const loadModule = async () => {
      try {
        const { getZcashModule } = await import('@/lib/zcash/zcashService');
        const module = getZcashModule();
        setZcashModule(module);
        
        // Load validation functions from SDK
        try {
          const sdk = await import('@miden/zcash-integration');
          validateAddressSDK = sdk.validateAddress;
          isAddressForNetworkSDK = sdk.isAddressForNetwork;
        } catch (sdkErr) {
          console.warn('Failed to load SDK validation functions:', sdkErr);
        }
      } catch (err) {
        console.error('Failed to load Zcash module:', err);
      }
    };
    if (open) {
      loadModule();
      // Reset form when dialog opens
      setToAddress('');
      setAmount('');
      setMemo('');
      setError(null);
      setTxHash(null);
      setFromType(fromAddressType || (fromAddress?.startsWith('t') || fromAddress?.startsWith('tm') ? 'transparent' : 'shielded') || 'transparent');
      setToType('transparent');
      setFee('0.0001');
    }
  }, [open, fromAddress, fromAddressType]);

  const validateAddress = (address: string): { valid: boolean; error?: string } => {
    const sanitized = address?.trim() || '';

    if (!sanitized) {
      return { valid: false, error: 'Address is required' };
    }

    if (toType === 'transparent') {
      if (!sanitized.startsWith('t') && !sanitized.startsWith('tm')) {
        return { valid: false, error: 'Invalid transparent address format' };
      }
    } else {
      if (!sanitized.startsWith('zs') && !sanitized.startsWith('ztestsapling') && !sanitized.startsWith('u') && !sanitized.startsWith('utest')) {
        return { valid: false, error: 'Invalid shielded address format' };
      }
    }

    if (validateAddressSDK) {
      try {
        const result = validateAddressSDK(sanitized);
        if (!result.valid) {
          console.warn('[SendZcashDialog] SDK validation failed:', result);
        } else {
          if (zcashModule && isAddressForNetworkSDK) {
            try {
              const network = zcashModule.getNetwork ? zcashModule.getNetwork() : 'testnet';
              if (!isAddressForNetworkSDK(sanitized, network)) {
                return {
                  valid: false,
                  error: `Address is for ${result.network} but wallet is configured for ${network}`
                };
              }
            } catch (networkErr) {
              console.warn('Network validation failed:', networkErr);
            }
          }

          if (result.type !== toType && result.type !== 'orchard') {
            if (toType === 'shielded' && result.type === 'orchard') {
              return { valid: true };
            }
            return {
              valid: false,
              error: `Address is ${result.type} but ${toType} was selected`
            };
          }
        }
      } catch (err) {
        console.error('SDK validation error:', err);
      }
    }

    return { valid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTxHash(null);

    if (!toAddress || !amount || !midenAccountId || !zcashModule) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Determine actual from address based on selected type
    const actualFromAddress = fromType === 'transparent' 
      ? (tAddress || fromAddress || '')
      : (zAddress || fromAddress || '');
    
    if (!actualFromAddress) {
      toast.error(`No ${fromType} address available`);
      setSending(false);
      return;
    }

    // Check balance
    // Note: transparentBalance and shieldedBalance are in zatoshi (not ZEC)
    const availableBalance = fromType === 'transparent' ? transparentBalance : shieldedBalance;
    console.log(`[SendZcashDialog] Available balance: ${availableBalance} zatoshi (${(availableBalance / 100000000).toFixed(8)} ZEC) for ${fromType} address`);
    
    if (availableBalance <= 0) {
      toast.error(`Insufficient ${fromType} balance`);
      setSending(false);
      return;
    }

    // Sanitize and validate address
    const sanitizedAddress = toAddress.trim();
    const validation = validateAddress(sanitizedAddress);
    if (!validation.valid) {
      const errorMsg = validation.error || `Invalid ${toType} address format! Please verify if you entered your Zcash address correctly and try again.`;
      toast.error(errorMsg);
      setError(errorMsg);
      setSending(false);
      return;
    }
    
    // Update toAddress with sanitized version
    const finalAddress = sanitizedAddress;

    try {
      setSending(true);

      const amountStr = amount.trim();
      
      if (!/^\d+(\.\d{1,8})?$/.test(amountStr)) {
        toast.error('Invalid amount format. Use numbers only (e.g., 0.12345678)');
        setSending(false);
        return;
      }
      
      const parts = amountStr.split('.');
      const integerPart = parts[0] || '0';
      let fractionalPart = parts[1] || '';
      
      while (fractionalPart.length < 8) {
        fractionalPart += '0';
      }
      
      if (fractionalPart.length > 8) {
        fractionalPart = fractionalPart.substring(0, 8);
      }
      
      const zatoshiString = integerPart + fractionalPart;
      const amountZatoshi = BigInt(zatoshiString);
      
      if (amountZatoshi <= BigInt(0)) {
        toast.error('Amount too small. Minimum is 1 zatoshi (0.00000001 ZEC)');
        setSending(false);
        return;
      }
      
      const amountZatoshiNumber = Number(amountZatoshi);

      const feeStr = fee.trim();
      let feeZatoshi = 10000;
      if (feeStr && /^\d+(\.\d{1,8})?$/.test(feeStr)) {
        const feeParts = feeStr.split('.');
        const feeInteger = feeParts[0] || '0';
        let feeFractional = feeParts[1] || '';
        while (feeFractional.length < 8) {
          feeFractional += '0';
        }
        if (feeFractional.length > 8) {
          feeFractional = feeFractional.substring(0, 8);
        }
        feeZatoshi = Number(BigInt(feeInteger + feeFractional));
      }

      const totalRequired = amountZatoshiNumber + feeZatoshi;
      console.log(`[SendZcashDialog] Transaction requirements: ${amountZatoshiNumber} zatoshi (amount) + ${feeZatoshi} zatoshi (fee) = ${totalRequired} zatoshi total`);
      console.log(`[SendZcashDialog] Available: ${availableBalance} zatoshi, Required: ${totalRequired} zatoshi`);
      
      if (totalRequired > availableBalance) {
        toast.error(`Insufficient balance. Required: ${(totalRequired / 100000000).toFixed(8)} ZEC (amount + fee), Available: ${(availableBalance / 100000000).toFixed(8)} ZEC`);
        setSending(false);
        return;
      }

      if (fromType === 'transparent') {
        const provider = zcashModule.getProvider();
        const utxoCache = (provider as any).utxoCache;
        
        if (utxoCache) {
          let utxos = utxoCache.getUTXOs(actualFromAddress);
          
          if (!utxos || utxos.length === 0) {
            toast.info('Syncing transparent address to discover UTXOs...');
            
            try {
              const syncResult = await provider.syncAddress(actualFromAddress, 'transparent');
              
              utxos = utxoCache.getUTXOs(actualFromAddress);
              
              if (!utxos || utxos.length === 0) {
                if (syncResult.updatedBalance.total === 0) {
                  throw new Error(
                    `No UTXOs found. The address has not received any funds.\n\n` +
                    `Please send funds to ${actualFromAddress.substring(0, 20)}... first.`
                  );
                } else {
                  throw new Error(
                    `No UTXOs available after sync. Balance: ${(syncResult.updatedBalance.total / 100000000).toFixed(8)} ZEC.\n\n` +
                    `Possible causes:\n` +
                    `1. The address has not received any confirmed transactions\n` +
                    `2. All UTXOs have been spent\n` +
                    `3. The node is still scanning the blockchain\n\n` +
                    `Note: The address has been automatically imported. If you just received funds, wait for the transaction to confirm (6+ confirmations).`
                  );
                }
              }
              
              toast.success(`Sync complete. Found ${utxos.length} UTXO(s) with ${(syncResult.updatedBalance.total / 100000000).toFixed(8)} ZEC`);
            } catch (syncError: any) {
              const syncErrorMsg = syncError?.message || 'Failed to sync transparent address';
              console.error('[SendZcashDialog] Auto-sync failed:', syncError);
              throw syncError;
            }
          }
        }
      }

      console.log('[SendZcashDialog] Sending transaction:', {
        from: actualFromAddress,
        to: finalAddress,
        amount: amountZatoshiNumber,
        amountZatoshi: amountZatoshi.toString(),
        fee: feeZatoshi,
        fromType,
        toType
      });

      const signedTx = await zcashModule.buildAndSignTransaction(midenAccountId, {
        from: {
          address: actualFromAddress.trim(),
          type: fromType
        },
        to: {
          address: finalAddress,
          type: toType
        },
        amount: amountZatoshiNumber,
        memo: memo || undefined,
        fee: feeZatoshi
      });

      console.log('[SendZcashDialog] Transaction signed, broadcasting...');

      const result = await zcashModule.broadcastTransaction(signedTx);
      
      setTxHash(result.hash);
      toast.success(`Transaction sent. Hash: ${result.hash}`);
      
      setTimeout(() => {
        setToAddress('');
        setAmount('');
        setMemo('');
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('[SendZcashDialog] Send failed:', err);
      let errorMsg = err?.message || 'Failed to send transaction';
      
      if (errorMsg.includes('listunspent') || errorMsg.includes('not supported') || errorMsg.includes('Cannot build transaction') || errorMsg.includes('RPC Limitation')) {
        errorMsg = errorMsg;
      } else if (errorMsg.includes('No UTXOs') || errorMsg.includes('UTXO')) {
        errorMsg = errorMsg;
      } else if (errorMsg.includes('No shielded notes found') || errorMsg.includes('hasn\'t scanned')) {
        errorMsg = `No Shielded Notes Found\n\n` +
          `The shielded address has not been synced.\n\n` +
          `Required actions:\n` +
          `1. Click "Sync Shielded Address"\n` +
          `2. Wait for blockchain scan to complete\n` +
          `3. Retry sending transaction after notes are discovered\n\n` +
          `Note: Shielded transactions must be received before notes can be discovered.`;
      } else if (errorMsg.includes('reindexing') || errorMsg.includes('disabled while reindexing')) {
        errorMsg = `Node is Reindexing\n\n` +
          `The Zcash node is currently reindexing blocks. Wallet operations are disabled during this process.\n\n` +
          `Implications:\n` +
          `- The node is synchronizing with the blockchain\n` +
          `- Wallet operations (listunspent, sendrawtransaction) are temporarily unavailable\n` +
          `- Reindexing must complete before transactions can be sent\n\n` +
          `Transaction sending will be available after reindexing completes.`;
      }
      
      setError(errorMsg);
      toast.error(errorMsg, {
        duration: 10000, // Show longer for important errors
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Send Zcash
          </DialogTitle>
          <DialogDescription>
            Send Zcash from your wallet to another address
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>From Address Type</Label>
            <select
              value={fromType}
              onChange={(e) => {
                const newFromType = e.target.value as 'transparent' | 'shielded';
                setFromType(newFromType);
                const addr = newFromType === 'transparent' ? tAddress : zAddress;
                if (!addr) {
                  toast.error(`No ${newFromType} address available`);
                }
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!tAddress && !zAddress}
            >
              <option value="transparent" disabled={!tAddress}>
                Transparent {tAddress ? `(${(transparentBalance / 100000000).toFixed(8)} ZEC)` : '(not available)'}
              </option>
              <option value="shielded" disabled={!zAddress}>
                Shielded {zAddress ? `(${(shieldedBalance / 100000000).toFixed(8)} ZEC)` : '(not available)'}
              </option>
            </select>
            {fromType === 'transparent' && tAddress && (
              <Input
                type="text"
                value={tAddress}
                disabled
                className="font-mono text-sm"
              />
            )}
            {fromType === 'shielded' && zAddress && (
              <Input
                type="text"
                value={zAddress}
                disabled
                className="font-mono text-sm"
              />
            )}
            {fromType === 'transparent' && !tAddress && (
              <p className="text-xs text-red-500">No transparent address available</p>
            )}
            {fromType === 'shielded' && !zAddress && (
              <p className="text-xs text-red-500">No shielded address available</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>To Address Type</Label>
            <select
              value={toType}
              onChange={(e) => setToType(e.target.value as 'transparent' | 'shielded')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="transparent">Transparent (t-address)</option>
              <option value="shielded">Shielded (z-address)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>To Address</Label>
            <Input
              type="text"
              value={toAddress}
              onChange={(e) => {
                const trimmed = e.target.value.trim();
                setToAddress(trimmed || e.target.value);
              }}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed !== e.target.value) {
                  setToAddress(trimmed);
                }
              }}
              placeholder={toType === 'transparent' ? 'tm...' : 'ztestsapling...'}
              className="font-mono text-sm"
              required
            />
            {toAddress && (() => {
              const validation = validateAddress(toAddress);
              return !validation.valid && (
                <p className="text-xs text-red-500">{validation.error || `Invalid ${toType} address format`}</p>
              );
            })()}
          </div>

          <div className="space-y-2">
            <Label>Amount (ZEC)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('e') || val.includes('E')) {
                  const num = parseFloat(val);
                  if (!isNaN(num)) {
                    setAmount(num.toFixed(8));
                  } else {
                    setAmount(val.replace(/[eE]/g, ''));
                  }
                } else {
                  setAmount(val);
                }
              }}
              step="0.00000001"
              min="0.00000001"
              placeholder="0.00000000"
              required
            />
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.floor(parseFloat(amount) * 100000000).toLocaleString()} zatoshi
                {parseFloat(amount) < 0.00000001 && (
                  <span className="text-yellow-600 dark:text-yellow-400 ml-2">
                    (Very small amount - minimum is 0.00000001 ZEC = 1 zatoshi)
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Fee (ZEC)</Label>
            <Input
              type="number"
              value={fee}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('e') || val.includes('E')) {
                  const num = parseFloat(val);
                  if (!isNaN(num)) {
                    setFee(num.toFixed(8));
                  } else {
                    setFee(val.replace(/[eE]/g, ''));
                  }
                } else {
                  setFee(val);
                }
              }}
              step="0.00000001"
              min="0.0001"
              placeholder="0.0001"
              required
            />
            <p className="text-xs text-muted-foreground">
              Default fee: 0.0001 ZEC (10,000 zatoshi). Higher fees may result in faster confirmation.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Memo (optional)</Label>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional memo (max 512 characters, only for shielded transactions)"
              maxLength={512}
              rows={3}
              disabled={toType === 'transparent'}
            />
            <p className="text-xs text-muted-foreground">
              {memo.length}/512 characters {toType === 'transparent' && '(memos only work for shielded transactions)'}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {txHash && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-200 mb-2">
                <strong>Success!</strong> Transaction sent
              </p>
              <code className="text-xs break-all">{txHash}</code>
              <div className="mt-2">
                <a
                  href={`https://testnet.cipherscan.app/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View on CipherScan →
                </a>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                sending || 
                !toAddress || 
                !amount || 
                !validateAddress(toAddress).valid || 
                !midenAccountId ||
                (fromType === 'transparent' && !tAddress) ||
                (fromType === 'shielded' && !zAddress)
              }
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

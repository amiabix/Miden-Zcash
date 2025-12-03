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
  fromAddress: string;
  midenAccountId?: string;
}

export function SendZcashDialog({ open, onClose, fromAddress, midenAccountId }: SendZcashDialogProps) {
  const [zcashModule, setZcashModule] = useState<any>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [addressType, setAddressType] = useState<'transparent' | 'shielded'>('transparent');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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
    }
  }, [open]);

  const validateAddress = (address: string): { valid: boolean; error?: string } => {
    // Input sanitization: trim whitespace
    const sanitized = address?.trim() || '';
    
    if (!sanitized) {
      return { valid: false, error: 'Address is required' };
    }
    
    // Use SDK validation if available (includes checksum validation)
    if (validateAddressSDK) {
      try {
        const result = validateAddressSDK(sanitized);
        if (!result.valid) {
          return { valid: false, error: result.error || 'Invalid address format' };
        }
        
        // Network validation: check if address matches configured network
        if (zcashModule && isAddressForNetworkSDK) {
          try {
            // Get network from module
            const network = zcashModule.getNetwork ? zcashModule.getNetwork() : 'testnet';
            if (!isAddressForNetworkSDK(sanitized, network)) {
              return { 
                valid: false, 
                error: `Address is for ${result.network} but wallet is configured for ${network}` 
              };
            }
          } catch (networkErr) {
            // Network validation failed, but address format is valid
            console.warn('Network validation failed:', networkErr);
          }
        }
        
        // Type validation: check if address type matches selected type
        if (result.type !== addressType && result.type !== 'orchard') {
          // Allow orchard addresses for shielded type
          if (addressType === 'shielded' && result.type === 'orchard') {
            return { valid: true };
          }
          return { 
            valid: false, 
            error: `Address is ${result.type} but ${addressType} was selected` 
          };
        }
        
        return { valid: true };
      } catch (err) {
        console.error('SDK validation error:', err);
        // Fallback to prefix check
      }
    }
    
    // Fallback: prefix-only validation (less secure, but better than nothing)
    if (addressType === 'transparent') {
      if (!sanitized.startsWith('t') && !sanitized.startsWith('tm')) {
        return { valid: false, error: 'Invalid transparent address format' };
      }
    } else {
      if (!sanitized.startsWith('zs') && !sanitized.startsWith('ztestsapling') && !sanitized.startsWith('u') && !sanitized.startsWith('utest')) {
        return { valid: false, error: 'Invalid shielded address format' };
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

    // Sanitize and validate address
    const sanitizedAddress = toAddress.trim();
    const validation = validateAddress(sanitizedAddress);
    if (!validation.valid) {
      toast.error(validation.error || `Invalid ${addressType} address format`);
      return;
    }
    
    // Update toAddress with sanitized version
    const finalAddress = sanitizedAddress;

    try {
      setSending(true);

      // Convert ZEC to zatoshi using BigInt to avoid float precision loss
      // Parse the amount string directly to avoid floating point errors
      const amountStr = amount.trim();
      
      // Validate format: must be a valid decimal number
      if (!/^\d+(\.\d{1,8})?$/.test(amountStr)) {
        toast.error('Invalid amount format. Use numbers only (e.g., 0.12345678)');
        setSending(false);
        return;
      }
      
      // Split into integer and fractional parts
      const parts = amountStr.split('.');
      const integerPart = parts[0] || '0';
      let fractionalPart = parts[1] || '';
      
      // Pad fractional part to 8 decimal places (zatoshi precision)
      while (fractionalPart.length < 8) {
        fractionalPart += '0';
      }
      
      // Truncate to 8 decimal places if longer
      if (fractionalPart.length > 8) {
        fractionalPart = fractionalPart.substring(0, 8);
      }
      
      // Combine integer and fractional parts as a string, then convert to BigInt
      const zatoshiString = integerPart + fractionalPart;
      const amountZatoshi = BigInt(zatoshiString);
      
      // Validate minimum amount: 1 zatoshi = 0.00000001 ZEC
      if (amountZatoshi <= 0n) {
        toast.error('Amount too small. Minimum is 1 zatoshi (0.00000001 ZEC)');
        setSending(false);
        return;
      }
      
      // Convert BigInt to number for transaction (zatoshi fits in safe integer range)
      const amountZatoshiNumber = Number(amountZatoshi);

      // Determine transaction type
      const fromType = fromAddress.startsWith('t') || fromAddress.startsWith('tm') ? 'transparent' : 'shielded';
      const toType = addressType;

      console.log('[SendZcashDialog] Sending transaction:', {
        from: fromAddress,
        to: toAddress,
        amount: amountZatoshiNumber,
        amountZatoshi: amountZatoshi.toString(),
        fromType,
        toType
      });

      // Build and sign transaction (use sanitized address)
      const signedTx = await zcashModule.buildAndSignTransaction(midenAccountId, {
        from: {
          address: fromAddress.trim(),
          type: fromType
        },
        to: {
          address: finalAddress,
          type: toType
        },
        amount: amountZatoshiNumber,
        memo: memo || undefined,
        fee: 10000 // Default fee in zatoshi
      });

      console.log('[SendZcashDialog] Transaction signed, broadcasting...');

      // Broadcast transaction
      const result = await zcashModule.broadcastTransaction(signedTx);
      
      setTxHash(result.hash);
      toast.success(`Transaction sent! Hash: ${result.hash}`);
      
      // Reset form after short delay
      setTimeout(() => {
        setToAddress('');
        setAmount('');
        setMemo('');
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('[SendZcashDialog] Send failed:', err);
      const errorMsg = err?.message || 'Failed to send transaction';
      setError(errorMsg);
      toast.error(errorMsg);
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
            <Label>From Address</Label>
            <Input
              type="text"
              value={fromAddress}
              disabled
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>To Address Type</Label>
            <select
              value={addressType}
              onChange={(e) => setAddressType(e.target.value as 'transparent' | 'shielded')}
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
                // Auto-trim whitespace on input
                const trimmed = e.target.value.trim();
                setToAddress(trimmed || e.target.value);
              }}
              onBlur={(e) => {
                // Trim on blur to clean up any trailing whitespace
                const trimmed = e.target.value.trim();
                if (trimmed !== e.target.value) {
                  setToAddress(trimmed);
                }
              }}
              placeholder={addressType === 'transparent' ? 'tm...' : 'ztestsapling...'}
              className="font-mono text-sm"
              required
            />
            {toAddress && (() => {
              const validation = validateAddress(toAddress);
              return !validation.valid && (
                <p className="text-xs text-red-500">{validation.error || `Invalid ${addressType} address format`}</p>
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
                // Prevent scientific notation in input
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
            <Label>Memo (optional)</Label>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional memo (max 512 characters)"
              maxLength={512}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{memo.length}/512 characters</p>
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
              disabled={sending || !toAddress || !amount || !validateAddress(toAddress).valid || !midenAccountId}
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

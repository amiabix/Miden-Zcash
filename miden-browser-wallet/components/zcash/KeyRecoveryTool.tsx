"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Key, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface KeyRecoveryToolProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Key Recovery Tool
 * 
 * Allows users to recover Zcash keys from their Miden account file.
 * This is necessary because the key derivation is non-standard and
 * keys cannot be recovered in standard Zcash wallets.
 */
export function KeyRecoveryTool({ open, onClose }: KeyRecoveryToolProps) {
  const [accountFileBase64, setAccountFileBase64] = useState('');
  const [accountId, setAccountId] = useState('');
  const [recoveredAddresses, setRecoveredAddresses] = useState<{ tAddress: string; zAddress: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async () => {
    setError(null);
    setRecoveredAddresses(null);
    setLoading(true);

    try {
      if (!accountFileBase64 || !accountId) {
        throw new Error('Please provide both account file and account ID');
      }

      // Parse account file
      const accountFileBytes = Uint8Array.from(atob(accountFileBase64), c => c.charCodeAt(0));

      // Hash the account file (same process as key derivation)
      const hashBuffer = await crypto.subtle.digest('SHA-256', accountFileBytes);
      const privateKeyBytes = new Uint8Array(hashBuffer);

      // Import Zcash SDK to derive keys
      const zcashSDK = await import('@miden/zcash-integration');
      const { ZcashKeyDerivation } = zcashSDK;

      // Determine network from account ID (testnet addresses start with 'mtst')
      const network = accountId.startsWith('mtst') ? 'testnet' : 'mainnet';
      const keyDerivation = new ZcashKeyDerivation(network);

      // Derive keys using the same process as the wallet
      const keys = keyDerivation.deriveKeys(accountId, privateKeyBytes, 0);

      // Get addresses
      const tAddress = keys.addresses.transparent;
      const zAddress = keys.addresses.shielded;

      setRecoveredAddresses({ tAddress, zAddress });
      toast.success('Keys recovered successfully!');
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to recover keys';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes(':')) {
        const [base64, accountId] = text.split(':');
        setAccountFileBase64(base64);
        setAccountId(accountId);
        toast.success('Imported from clipboard');
      } else {
        throw new Error('Invalid format. Expected format: <base64>:<accountId>');
      }
    } catch (err: any) {
      toast.error('Failed to import from clipboard: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleExportAddresses = () => {
    if (!recoveredAddresses) return;

    const data = {
      accountId,
      tAddress: recoveredAddresses.tAddress,
      zAddress: recoveredAddresses.zAddress,
      recoveredAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zcash-keys-${accountId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Addresses exported to file');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Zcash Key Recovery Tool
          </DialogTitle>
          <DialogDescription>
            Recover your Zcash addresses from a Miden account file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold mb-1">Important:</p>
              <p className="text-sm">
                This tool recovers Zcash keys from your Miden account file using the same
                non-standard derivation method. Keys derived this way cannot be recovered
                in standard Zcash wallets.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Miden Account File (Base64)</Label>
            <Textarea
              value={accountFileBase64}
              onChange={(e) => setAccountFileBase64(e.target.value)}
              placeholder="Paste the base64-encoded account file here"
              className="font-mono text-xs"
              rows={4}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportFromClipboard}
              className="w-full"
            >
              Import from Clipboard (Format: base64:accountId)
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Miden Account ID</Label>
            <Input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="mtst1..."
              className="font-mono"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {recoveredAddresses && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">Keys Recovered Successfully!</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="font-semibold">Transparent Address:</p>
                    <code className="block bg-muted p-2 rounded mt-1 break-all">
                      {recoveredAddresses.tAddress}
                    </code>
                  </div>
                  <div>
                    <p className="font-semibold">Shielded Address:</p>
                    <code className="block bg-muted p-2 rounded mt-1 break-all">
                      {recoveredAddresses.zAddress}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportAddresses}
                    className="w-full mt-2"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Addresses to File
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              onClick={handleRecover}
              disabled={loading || !accountFileBase64 || !accountId}
            >
              {loading ? 'Recovering...' : 'Recover Keys'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}





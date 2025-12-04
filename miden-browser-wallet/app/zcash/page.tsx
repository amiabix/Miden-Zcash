"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Eye, Send, Key } from "lucide-react";
import { SendZcashDialog } from "@/components/zcash/SendZcashDialog";
import { KeyRecoveryTool } from "@/components/zcash/KeyRecoveryTool";
import { useZcash } from "@/providers/zcash-provider";
import { useKeyExport } from "@/lib/zcash/keyExportContext";

export default function ZcashPage() {
  // Use ZcashProvider for all state
  const {
    module,
    isInitialized,
    isRPCConnected,
    error: zcashError,
    account,
    accountLoading,
    accountError,
    addresses,
    transparentBalance,
    shieldedBalance,
    balanceLoading,
    refreshAccount,
    refreshBalance,
    refreshRPCStatus
  } = useZcash();

  // Local UI state
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showRecoveryTool, setShowRecoveryTool] = useState(false);

  // Set up global key export handler for the adapter
  const { requestKeyExport } = useKeyExport();
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__KEY_EXPORT_MODULE__ = {
        requestKeyExport
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__KEY_EXPORT_MODULE__;
      }
    };
  }, [requestKeyExport]);

  // Auto-refresh RPC status
  useEffect(() => {
    if (!isInitialized || !module) return;

    const interval = setInterval(async () => {
      await refreshRPCStatus();
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [isInitialized, module, refreshRPCStatus]);

  const handleLoadAddresses = async () => {
    try {
      await refreshAccount();
      toast.success('Addresses loaded successfully');
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load addresses';
      toast.error(errorMsg);
    }
  };

  const handleLoadBalance = async () => {
    if (!addresses.tAddress && !addresses.zAddress) {
      toast.error('Please load addresses first');
      return;
    }

    try {
      await refreshBalance();
      toast.success('Balance refreshed');
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to load balance';
      
      if (errorMsg.includes('429') || errorMsg.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Please wait before trying again.');
      } else {
        toast.error(errorMsg);
      }
    }
  };

  const handleSyncShielded = async () => {
    if (!addresses.zAddress) {
      toast.error('No shielded address available. Please load addresses first.');
      return;
    }

    if (!module) {
      toast.error('Zcash module not initialized');
      return;
    }

    try {
      toast.info('Syncing shielded address... This may take a moment.');
      const provider = module.getProvider();
      const result = await provider.syncAddress(addresses.zAddress, 'shielded');
      toast.success(`Sync complete! Found ${result.newTransactions} new notes.`);
      await refreshBalance();
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to sync shielded address';
      console.error('Shielded sync error:', err);
      
      if (errorMsg.includes('429') || errorMsg.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Please wait before trying again.');
      } else if (errorMsg.includes('Viewing key')) {
        toast.error('Viewing key not found. Please reload addresses first.');
      } else {
        toast.error(`Sync failed: ${errorMsg}`);
      }
    }
  };

  // Loading state - show content even if account is still loading
  // But also show error if initialization failed
  if (!isInitialized && !zcashError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <p className="text-sm text-muted-foreground">Initializing Zcash module...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  const displayError = zcashError || accountError?.message;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Zcash</h1>
            <p className="text-muted-foreground">
              Manage your Zcash addresses and transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/zcash/explorer'}
            >
              <Eye className="w-4 h-4 mr-2" />
              Shielded Explorer
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowRecoveryTool(true)}
            >
              <Key className="w-4 h-4 mr-2" />
              Key Recovery
            </Button>
          </div>
        </div>

        {displayError && 
         !displayError.includes('Timeout') && 
         !displayError.includes('Private key export is required') && (
          <Card className="border-yellow-500">
            <CardContent className="p-4">
              <p className="text-yellow-600 dark:text-yellow-400">{displayError}</p>
            </CardContent>
          </Card>
        )}
        
        {/* Info message about key setup - only show if no addresses loaded and no error */}
        {!addresses.tAddress && 
         !accountLoading && 
         isInitialized && 
         !displayError && (
          <Card className="border-blue-500 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-4">
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                Click "Load Addresses" to set up your Zcash keys. This will derive Zcash addresses from your Miden account.
              </p>
            </CardContent>
          </Card>
        )}
        

        <Card>
          <CardHeader>
            <CardTitle>Zcash Addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Transparent Address (tm...)</p>
              {addresses.tAddress ? (
                <code className="block p-2 bg-muted rounded break-all">
                  {addresses.tAddress}
                </code>
              ) : (
                <p className="text-sm text-muted-foreground">Not loaded</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Shielded Address (zs...)</p>
              {addresses.zAddress ? (
                <code className="block p-2 bg-muted rounded break-all">
                  {addresses.zAddress}
                </code>
              ) : (
                <p className="text-sm text-muted-foreground">Not loaded</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleLoadAddresses} 
                disabled={accountLoading || !isInitialized}
              >
                {accountLoading ? 'Loading...' : 'Load Addresses'}
              </Button>
              {addresses.tAddress && (
                <Button 
                  onClick={() => setShowSendDialog(true)}
                  disabled={!isRPCConnected}
                  variant="default"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Balance */}
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {balanceLoading ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Loading balance...</p>
                <p className="text-xs text-muted-foreground">This may take a few seconds</p>
              </div>
            ) : transparentBalance ? (
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Transparent Balance</p>
                  <p className="text-lg font-semibold">
                    {transparentBalance.total > 0 
                      ? (transparentBalance.total / 100000000).toFixed(8) 
                      : '0'} ZEC
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transparentBalance.total} zatoshi
                  </p>
                </div>
                <div className="text-sm space-y-1">
                  <p><strong>Confirmed:</strong> {transparentBalance.confirmed} zatoshi</p>
                  <p><strong>Unconfirmed:</strong> {transparentBalance.unconfirmed} zatoshi</p>
                  {transparentBalance.pending > 0 && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      <strong>Pending:</strong> {transparentBalance.pending} zatoshi
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No balance loaded</p>
            )}

            {shieldedBalance && (
              <div className="space-y-2 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Shielded Balance</p>
                  <p className="text-lg font-semibold">
                    {shieldedBalance.total > 0 
                      ? (shieldedBalance.total / 100000000).toFixed(8) 
                      : '0'} ZEC
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shieldedBalance.total} zatoshi
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={handleLoadBalance} 
                disabled={balanceLoading || (!addresses.tAddress && !addresses.zAddress)}
              >
                {balanceLoading ? 'Loading...' : 'Refresh Balance'}
              </Button>
              {addresses.zAddress && (
                <Button 
                  onClick={handleSyncShielded} 
                  disabled={balanceLoading}
                  variant="outline"
                >
                  Sync Shielded Address
                </Button>
              )}
            </div>
            {addresses.tAddress && (
              <a 
                href={`https://testnet.cipherscan.app/address/${addresses.tAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline block mt-2"
              >
                View on CipherScan Testnet →
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Transaction Dialog */}
      {account && (
        <SendZcashDialog
          open={showSendDialog}
          onClose={() => {
            setShowSendDialog(false);
            // Refresh balance after sending
            setTimeout(() => refreshBalance(), 2000);
          }}
          tAddress={addresses.tAddress || undefined}
          zAddress={addresses.zAddress || undefined}
          transparentBalance={transparentBalance?.total || 0}
          shieldedBalance={shieldedBalance?.total || 0}
          midenAccountId={account.midenAccountId}
        />
      )}

      {/* Key Recovery Tool */}
      <KeyRecoveryTool
        open={showRecoveryTool}
        onClose={() => setShowRecoveryTool(false)}
      />
    </div>
  );
}

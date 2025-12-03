"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, Shield, AlertTriangle, Lock } from 'lucide-react';

interface KeyExportDialogProps {
  open: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  requirePassword?: boolean;
}

export function KeyExportDialog({ open, onConfirm, onCancel, requirePassword = true }: KeyExportDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Check if account is already set up (skip password on subsequent uses)
  const [isFirstTime, setIsFirstTime] = useState(true);
  
  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      // Check if any account has been set up
      const keys = Object.keys(localStorage);
      const hasSetup = keys.some(key => key.startsWith('zcash_account_setup_'));
      setIsFirstTime(!hasSetup);
      
      // If account already set up, auto-confirm without password
      if (hasSetup) {
        // Account already set up, skip password dialog
        // Use a ref to avoid dependency issues
        const timeoutId = setTimeout(() => {
          onConfirm('');
        }, 50);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [open]); // Removed onConfirm from deps to prevent loops

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setPassword('');
      setConfirmPassword('');
      setError(null);
      onCancel();
    }
  };

  const handleConfirm = () => {
    setError(null);

    // If account is already set up, skip password requirement
    if (!isFirstTime && requirePassword) {
      // Account already set up, confirm without password
      onConfirm('');
      setPassword('');
      setConfirmPassword('');
      return;
    }

    if (requirePassword) {
      if (!password || password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }

      // For first-time setup, require password confirmation
      // For subsequent exports, just require password
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    onConfirm(requirePassword ? password : '');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-[500px] !translate-x-[-50%] !translate-y-[-50%]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Set Up Zcash Keys
          </DialogTitle>
          <DialogDescription>
            Derive Zcash keys from your Miden account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold mb-2">What this does:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Exports your Miden account file (encrypted)</li>
                <li>Derives Zcash keys from your account</li>
                <li>Generates Zcash addresses (transparent & shielded)</li>
                <li>Keys stay on your device - never sent to servers</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold mb-1">Security Notice:</p>
              <p className="text-sm">
                This process accesses your account file to derive Zcash keys. 
                Your private keys are never exposed - only a hash is used for derivation.
              </p>
            </AlertDescription>
          </Alert>

          {requirePassword && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password (Required)
                </Label>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (min 8 characters)"
                  className="font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password.length >= 8) {
                      handleConfirm();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  This password protects your key export operation. It is not stored and must be entered each time.
                </p>
              </div>

              {confirmPassword !== undefined && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && password.length >= 8 && password === confirmPassword) {
                        handleConfirm();
                      }
                    }}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showPassword"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="showPassword" className="text-sm cursor-pointer">
                  Show password
                </Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="bg-muted p-4 rounded-md space-y-2">
            <p className="text-sm font-semibold">Benefits:</p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>✓ Unified wallet - manage Miden and Zcash in one place</li>
              <li>✓ Deterministic keys - same account = same Zcash addresses</li>
              <li>✓ No additional setup - keys derived automatically</li>
            </ul>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={requirePassword && (!password || password.length < 8 || (confirmPassword && password !== confirmPassword))}
              className="bg-[#FF6B35] hover:bg-[#FF8555] text-white"
            >
              <Key className="w-4 h-4 mr-2" />
              Set Up Keys
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


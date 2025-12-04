/**
 * Zcash Account View Component
 * 
 * Displays Zcash account information, addresses, and balances.
 * 
 * Location: miden-wallet/src/modules/zcash/components/ZcashAccountView.tsx
 */

import React from 'react';
import { useZcashAccount, useZcashBalance } from '../hooks';
import { getZcashModule } from '../services/zcashService';
import { SendZcashDialog } from './SendZcashDialog';

export function ZcashAccountView() {
  const zcashModule = getZcashModule();
  const { account, addresses, loading, error, refresh } = useZcashAccount(zcashModule);
  const { transparent, shielded, total, loading: balanceLoading } = useZcashBalance(
    zcashModule,
    addresses.tAddress,
    addresses.zAddress
  );

  const [showSendDialog, setShowSendDialog] = React.useState(false);

  if (loading) {
    return (
      <div className="zcash-account-view">
        <div className="loading">Loading Zcash account...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="zcash-account-view">
        <div className="error">
          <p>Error loading Zcash account: {error.message}</p>
          <button onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="zcash-account-view">
        <div className="no-account">
          <p>No Zcash account found. Please create a Miden account first.</p>
        </div>
      </div>
    );
  }

  const formatZatoshi = (zatoshi: number): string => {
    return (zatoshi / 100000000).toFixed(8);
  };

  return (
    <div className="zcash-account-view">
      <div className="account-header">
        <h2>Zcash Account</h2>
        <p className="account-name">{account.midenAccountName}</p>
        <button onClick={refresh} disabled={balanceLoading}>
          {balanceLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="addresses">
        <div className="address-section">
          <h3>Transparent Address</h3>
          <div className="address-display">
            <code>{addresses.tAddress}</code>
            <button 
              onClick={() => navigator.clipboard.writeText(addresses.tAddress || '')}
              title="Copy address"
            >
              Copy
            </button>
          </div>
          <div className="balance">
            <span className="label">Balance:</span>
            <span className="value">
              {transparent ? formatZatoshi(transparent.total) : '0.00000000'} ZEC
            </span>
            {transparent && transparent.unconfirmed > 0 && (
              <span className="unconfirmed">
                (+{formatZatoshi(transparent.unconfirmed)} unconfirmed)
              </span>
            )}
          </div>
        </div>

        <div className="address-section">
          <h3>Shielded Address</h3>
          <div className="address-display">
            <code>{addresses.zAddress}</code>
            <button 
              onClick={() => navigator.clipboard.writeText(addresses.zAddress || '')}
              title="Copy address"
            >
              Copy
            </button>
          </div>
          <div className="balance">
            <span className="label">Balance:</span>
            <span className="value">
              {shielded ? formatZatoshi(shielded.total) : '0.00000000'} ZEC
            </span>
            {shielded && shielded.unconfirmed > 0 && (
              <span className="unconfirmed">
                (+{formatZatoshi(shielded.unconfirmed)} unconfirmed)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="total-balance">
        <h3>Total Balance</h3>
        <div className="balance-large">
          {formatZatoshi(total.total)} ZEC
        </div>
      </div>

      <div className="actions">
        <button 
          className="send-button"
          onClick={() => setShowSendDialog(true)}
          disabled={!addresses.tAddress}
        >
          Send Zcash
        </button>
        <button 
          className="shield-button"
          onClick={() => {/* TODO: Implement shield dialog */}}
          disabled={!transparent || transparent.total === 0}
        >
          Shield (t→z)
        </button>
        <button 
          className="unshield-button"
          onClick={() => {/* TODO: Implement unshield dialog */}}
          disabled={!shielded || shielded.total === 0}
        >
          Unshield (z→t)
        </button>
      </div>

      {showSendDialog && account && (
        <SendZcashDialog
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          tAddress={addresses.tAddress || undefined}
          zAddress={addresses.zAddress || undefined}
          transparentBalance={transparent?.total || 0}
          shieldedBalance={shielded?.total || 0}
          midenAccountId={account.midenAccountId}
        />
      )}
    </div>
  );
}


/**
 * Wallet Integration
 * 
 * Main integration point for Miden Wallet
 */

// Core integration
export { ZcashModule, createZcashModule } from './integration';
export type { ZcashModuleConfig } from './integration';

// Key bridge
export { MidenKeyBridge, createMidenKeyBridge } from './midenKeyBridge';
export type { MidenWalletAPI, DerivedZcashAccount } from './midenKeyBridge';

// SDK bridge (legacy, use ZcashModule instead)
// Temporarily commented out due to import issues - will fix in next update
// export { ZcashSDKBridge, createZcashSDKBridge } from './zcashSDKBridge';
// export type { ZcashSDKConfig, BalanceInfo, TransactionInfo, BuildTransactionRequest } from './zcashSDKBridge';

// React hooks (optional - only work in React environments)
// Wallet developers should copy these to their React project
// Hooks are not exported from the main SDK to avoid importing React in server environments.
// Wallets should copy hooks directly from src/wallet/hooks/ or import them individually.

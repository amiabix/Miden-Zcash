/**
 * Key Derivation Tests
 * Comprehensive tests for Zcash key derivation from Miden accounts
 */

import { ZcashKeyDerivation } from '../src/crypto/keyDerivation';
import type { ZcashKeys, Network } from '../src/types';

describe('ZcashKeyDerivation', () => {
  let derivation: ZcashKeyDerivation;

  beforeEach(() => {
    derivation = new ZcashKeyDerivation('testnet');
  });

  describe('deriveKeys()', () => {
    it('should derive deterministic keys from same input', () => {
      const midenAccountId = 'test-account-1';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys1 = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      const keys2 = derivation.deriveKeys(midenAccountId, midenPrivateKey);

      expect(keys1.tAddress).toBe(keys2.tAddress);
      expect(keys1.zAddress).toBe(keys2.zAddress);
      expect(
        bytesToHex(keys1.spendingKey)
      ).toBe(
        bytesToHex(keys2.spendingKey)
      );
    });

    it('should generate different keys from different Miden accounts', () => {
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys1 = derivation.deriveKeys('account-1', midenPrivateKey);
      const keys2 = derivation.deriveKeys('account-2', midenPrivateKey);

      expect(keys1.tAddress).not.toBe(keys2.tAddress);
      expect(keys1.zAddress).not.toBe(keys2.zAddress);
    });

    it('should generate different keys from different Miden private keys', () => {
      const midenAccountId = 'test-account';
      const privateKey1 = new Uint8Array(32).fill(1);
      const privateKey2 = new Uint8Array(32).fill(2);

      const keys1 = derivation.deriveKeys(midenAccountId, privateKey1);
      const keys2 = derivation.deriveKeys(midenAccountId, privateKey2);

      expect(keys1.tAddress).not.toBe(keys2.tAddress);
      expect(keys1.zAddress).not.toBe(keys2.zAddress);
    });

    it('should derive valid transparent addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);

      expect(keys.tAddress).toBeDefined();
      expect(keys.tAddress.length).toBeGreaterThan(0);
      // Testnet addresses start with 'tm' or 't2'
      expect(
        keys.tAddress.startsWith('tm') || keys.tAddress.startsWith('t2')
      ).toBe(true);
    });

    it('should derive valid shielded addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);

      expect(keys.zAddress).toBeDefined();
      expect(keys.zAddress.length).toBeGreaterThan(0);
      // Testnet shielded addresses start with 'ztestsapling'
      expect(keys.zAddress.startsWith('ztestsapling')).toBe(true);
    });

    it('should derive all required key components', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);

      expect(keys.spendingKey).toBeDefined();
      expect(keys.spendingKey.length).toBeGreaterThan(0);

      expect(keys.viewingKey).toBeDefined();
      expect(keys.viewingKey.length).toBeGreaterThan(0);

      expect(keys.transparentPrivateKey).toBeDefined();
      expect(keys.transparentPrivateKey.length).toBe(32);

      expect(keys.tAddress).toBeDefined();
      expect(keys.zAddress).toBeDefined();
    });

    it('should handle different account indices', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys0 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 0);
      const keys1 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 1);

      expect(keys0.tAddress).not.toBe(keys1.tAddress);
      expect(keys0.zAddress).not.toBe(keys1.zAddress);
    });
  });

  describe('generateTransparentAddress()', () => {
    it('should generate consistent addresses from same public key', () => {
      const publicKey = new Uint8Array(33).fill(1);

      const address1 = derivation.generateTransparentAddress(publicKey);
      const address2 = derivation.generateTransparentAddress(publicKey);

      expect(address1).toBe(address2);
    });

    it('should generate different addresses from different public keys', () => {
      const publicKey1 = new Uint8Array(33).fill(1);
      const publicKey2 = new Uint8Array(33).fill(2);

      const address1 = derivation.generateTransparentAddress(publicKey1);
      const address2 = derivation.generateTransparentAddress(publicKey2);

      expect(address1).not.toBe(address2);
    });
  });

  describe('generateShieldedAddress()', () => {
    it('should generate consistent addresses from same viewing key', () => {
      const viewingKey = new Uint8Array(32).fill(1);

      const address1 = derivation.generateShieldedAddress(viewingKey);
      const address2 = derivation.generateShieldedAddress(viewingKey);

      expect(address1).toBe(address2);
    });

    it('should generate different addresses from different viewing keys', () => {
      const viewingKey1 = new Uint8Array(32).fill(1);
      const viewingKey2 = new Uint8Array(32).fill(2);

      const address1 = derivation.generateShieldedAddress(viewingKey1);
      const address2 = derivation.generateShieldedAddress(viewingKey2);

      expect(address1).not.toBe(address2);
    });

    it('should use correct HRP for testnet', () => {
      const viewingKey = new Uint8Array(32).fill(1);

      const address = derivation.generateShieldedAddress(viewingKey);

      expect(address.startsWith('ztestsapling')).toBe(true);
    });
  });

  describe('validateTransparentAddress()', () => {
    it('should validate valid testnet addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      const isValid = derivation.validateTransparentAddress(keys.tAddress);

      expect(isValid).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const isValid = derivation.validateTransparentAddress('invalid-address');
      expect(isValid).toBe(false);
    });

    it('should reject corrupted addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      // Corrupt the address by changing last character
      const corrupted = keys.tAddress.slice(0, -1) + 'X';

      const isValid = derivation.validateTransparentAddress(corrupted);
      expect(isValid).toBe(false);
    });
  });

  describe('validateShieldedAddress()', () => {
    it('should validate valid testnet shielded addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      const isValid = derivation.validateShieldedAddress(keys.zAddress);

      expect(isValid).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const isValid = derivation.validateShieldedAddress('invalid-address');
      expect(isValid).toBe(false);
    });
  });

  describe('getAddressNetwork()', () => {
    it('should identify testnet transparent addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      const network = derivation.getAddressNetwork(keys.tAddress);

      expect(network).toBe('testnet');
    });

    it('should identify testnet shielded addresses', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey);
      const network = derivation.getAddressNetwork(keys.zAddress);

      expect(network).toBe('testnet');
    });

    it('should return null for invalid addresses', () => {
      const network = derivation.getAddressNetwork('invalid-address');
      expect(network).toBeNull();
    });
  });

  describe('Mainnet vs Testnet', () => {
    it('should generate different addresses for mainnet and testnet', () => {
      const midenAccountId = 'test-account';
      const midenPrivateKey = new Uint8Array(32).fill(1);

      const testnetDerivation = new ZcashKeyDerivation('testnet');
      const mainnetDerivation = new ZcashKeyDerivation('mainnet');

      const testnetKeys = testnetDerivation.deriveKeys(
        midenAccountId,
        midenPrivateKey
      );
      const mainnetKeys = mainnetDerivation.deriveKeys(
        midenAccountId,
        midenPrivateKey
      );

      expect(testnetKeys.tAddress).not.toBe(mainnetKeys.tAddress);
      expect(testnetKeys.zAddress).not.toBe(mainnetKeys.zAddress);
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid account ID', () => {
      const midenPrivateKey = new Uint8Array(32).fill(1);

      expect(() => {
        derivation.deriveKeys('', midenPrivateKey);
      }).toThrow();
    });

    it('should throw on invalid private key', () => {
      expect(() => {
        derivation.deriveKeys('test-account', new Uint8Array(16));
      }).toThrow();
    });

    it('should throw on invalid account index', () => {
      const midenPrivateKey = new Uint8Array(32).fill(1);

      expect(() => {
        derivation.deriveKeys('test-account', midenPrivateKey, -1);
      }).toThrow();
    });
  });
});

// Helper function
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

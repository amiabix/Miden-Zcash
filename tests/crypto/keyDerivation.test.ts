/**
 * Tests for key derivation
 */

import { ZcashKeyDerivation } from '../../src/crypto/keyDerivation';

describe('ZcashKeyDerivation', () => {
  let derivation: ZcashKeyDerivation;

  beforeEach(() => {
    derivation = new ZcashKeyDerivation('testnet');
  });

  describe('constructor', () => {
    test('creates instance for testnet', () => {
      const testnet = new ZcashKeyDerivation('testnet');
      expect(testnet).toBeInstanceOf(ZcashKeyDerivation);
    });

    test('creates instance for mainnet', () => {
      const mainnet = new ZcashKeyDerivation('mainnet');
      expect(mainnet).toBeInstanceOf(ZcashKeyDerivation);
    });
  });

  describe('deriveKeys', () => {
    const midenAccountId = 'miden-account-12345';
    const midenPrivateKey = new Uint8Array(32).fill(0x42);

    test('derives all required keys', () => {
      const keys = derivation.deriveKeys(midenAccountId, midenPrivateKey, 0);

      expect(keys.spendingKey).toBeInstanceOf(Uint8Array);
      expect(keys.spendingKey.length).toBe(32);

      expect(keys.viewingKey).toBeInstanceOf(Uint8Array);
      expect(keys.viewingKey.length).toBe(32);

      expect(keys.transparentPrivateKey).toBeInstanceOf(Uint8Array);
      expect(keys.transparentPrivateKey.length).toBe(32);

      expect(typeof keys.tAddress).toBe('string');
      expect(typeof keys.zAddress).toBe('string');
    });

    test('produces deterministic keys', () => {
      const keys1 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 0);
      const keys2 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 0);

      expect(keys1.spendingKey).toEqual(keys2.spendingKey);
      expect(keys1.viewingKey).toEqual(keys2.viewingKey);
      expect(keys1.transparentPrivateKey).toEqual(keys2.transparentPrivateKey);
      expect(keys1.tAddress).toBe(keys2.tAddress);
      expect(keys1.zAddress).toBe(keys2.zAddress);
    });

    test('produces different keys for different accounts', () => {
      const keys1 = derivation.deriveKeys('account-1', midenPrivateKey, 0);
      const keys2 = derivation.deriveKeys('account-2', midenPrivateKey, 0);

      expect(keys1.tAddress).not.toBe(keys2.tAddress);
      expect(keys1.zAddress).not.toBe(keys2.zAddress);
    });

    test('produces different keys for different account indices', () => {
      const keys1 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 0);
      const keys2 = derivation.deriveKeys(midenAccountId, midenPrivateKey, 1);

      expect(keys1.tAddress).not.toBe(keys2.tAddress);
      expect(keys1.zAddress).not.toBe(keys2.zAddress);
    });

    test('throws on empty account ID', () => {
      expect(() =>
        derivation.deriveKeys('', midenPrivateKey, 0)
      ).toThrow('Invalid Miden account ID');
    });

    test('throws on short private key', () => {
      expect(() =>
        derivation.deriveKeys(midenAccountId, new Uint8Array(16), 0)
      ).toThrow('Invalid Miden private key');
    });

    test('throws on negative account index', () => {
      expect(() =>
        derivation.deriveKeys(midenAccountId, midenPrivateKey, -1)
      ).toThrow('Invalid account index');
    });
  });

  describe('generateTransparentAddress', () => {
    test('generates valid testnet address format', () => {
      const publicKey = new Uint8Array(33);
      publicKey[0] = 0x02; // Compressed public key prefix
      publicKey.fill(0x42, 1);

      const address = derivation.generateTransparentAddress(publicKey);

      // Testnet addresses start with 't'
      expect(address.startsWith('t')).toBe(true);
    });

    test('produces deterministic addresses', () => {
      const publicKey = new Uint8Array(33);
      publicKey[0] = 0x02;
      publicKey.fill(0x42, 1);

      const addr1 = derivation.generateTransparentAddress(publicKey);
      const addr2 = derivation.generateTransparentAddress(publicKey);

      expect(addr1).toBe(addr2);
    });
  });

  describe('generateShieldedAddress', () => {
    test('generates valid testnet shielded address format', () => {
      const viewingKey = new Uint8Array(32).fill(0x42);
      const address = derivation.generateShieldedAddress(viewingKey);

      // Testnet shielded addresses start with 'ztestsapling'
      expect(address.startsWith('ztestsapling')).toBe(true);
    });
  });

  describe('validateTransparentAddress', () => {
    test('returns false for invalid address', () => {
      expect(derivation.validateTransparentAddress('')).toBe(false);
      expect(derivation.validateTransparentAddress('invalid')).toBe(false);
    });
  });

  describe('validateShieldedAddress', () => {
    test('returns false for invalid address', () => {
      expect(derivation.validateShieldedAddress('')).toBe(false);
      expect(derivation.validateShieldedAddress('invalid')).toBe(false);
    });
  });

  describe('getAddressNetwork', () => {
    test('identifies mainnet transparent address', () => {
      expect(derivation.getAddressNetwork('t1xxx')).toBe('mainnet');
    });

    test('identifies testnet transparent address', () => {
      expect(derivation.getAddressNetwork('tmxxx')).toBe('testnet');
    });

    test('identifies mainnet shielded address', () => {
      expect(derivation.getAddressNetwork('zs1xxx')).toBe('mainnet');
    });

    test('identifies testnet shielded address', () => {
      expect(derivation.getAddressNetwork('ztestsaplingxxx')).toBe('testnet');
    });

    test('returns null for unknown format', () => {
      expect(derivation.getAddressNetwork('unknown')).toBe(null);
    });
  });
});


/**
 * Key Storage Tests
 * Tests for persistent key storage with IndexedDB and encryption
 */

import { ZcashKeyManager, MemoryKeyStorage, IndexedDBKeyStorage } from '../src/crypto/keyStorage';
import type { ZcashKeys } from '../src/types';

describe('MemoryKeyStorage', () => {
  let storage: MemoryKeyStorage;
  let testKeys: ZcashKeys;

  beforeEach(() => {
    storage = new MemoryKeyStorage();
    testKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress123',
      zAddress: 'ztestsaplingTestAddress123'
    };
  });

  it('should store and retrieve encrypted keys', async () => {
    const accountId = 'test-account';
    const password = 'test-password-123';

    const manager = new ZcashKeyManager(storage);

    // Store keys
    await manager.storeKeys(accountId, testKeys, password);

    // Retrieve keys
    const retrieved = await manager.retrieveKeys(accountId, password);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.tAddress).toBe(testKeys.tAddress);
    expect(retrieved!.zAddress).toBe(testKeys.zAddress);
  });

  it('should return null for non-existent keys', async () => {
    const manager = new ZcashKeyManager(storage);
    const retrieved = await manager.retrieveKeys('non-existent', 'password');

    expect(retrieved).toBeNull();
  });

  it('should fail with wrong password', async () => {
    const accountId = 'test-account';
    const password = 'correct-password';

    const manager = new ZcashKeyManager(storage);
    await manager.storeKeys(accountId, testKeys, password);

    // Try with wrong password
    const retrieved = await manager.retrieveKeys(accountId, 'wrong-password');

    expect(retrieved).toBeNull();
  });

  it('should clear keys', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    const manager = new ZcashKeyManager(storage);
    await manager.storeKeys(accountId, testKeys, password);

    // Clear keys
    await manager.clearKeys(accountId);

    // Try to retrieve cleared keys
    const retrieved = await manager.retrieveKeys(accountId, password);
    expect(retrieved).toBeNull();
  });

  it('should lose keys on new instance', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    // First instance
    const manager1 = new ZcashKeyManager(storage);
    await manager1.storeKeys(accountId, testKeys, password);

    // Create new storage instance (simulating page reload)
    const newStorage = new MemoryKeyStorage();
    const manager2 = new ZcashKeyManager(newStorage);

    // Keys should be lost
    const retrieved = await manager2.retrieveKeys(accountId, password);
    expect(retrieved).toBeNull();
  });

  it('should handle multiple accounts', async () => {
    const password = 'shared-password';

    const manager = new ZcashKeyManager(storage);

    // Store keys for multiple accounts
    const account1Keys = { ...testKeys, tAddress: 'tmAddress1' };
    const account2Keys = { ...testKeys, tAddress: 'tmAddress2' };

    await manager.storeKeys('account-1', account1Keys, password);
    await manager.storeKeys('account-2', account2Keys, password);

    // Retrieve both
    const retrieved1 = await manager.retrieveKeys('account-1', password);
    const retrieved2 = await manager.retrieveKeys('account-2', password);

    expect(retrieved1!.tAddress).toBe('tmAddress1');
    expect(retrieved2!.tAddress).toBe('tmAddress2');
  });

  it('should preserve addresses in encrypted storage', async () => {
    const accountId = 'test-account';
    const password = 'test-password';
    const customKeys = {
      ...testKeys,
      tAddress: 'tmCustomTestAddress',
      zAddress: 'ztestsaplingCustomAddress'
    };

    const manager = new ZcashKeyManager(storage);
    await manager.storeKeys(accountId, customKeys, password);

    const retrieved = await manager.retrieveKeys(accountId, password);

    // CRITICAL: Addresses must be preserved
    expect(retrieved!.tAddress).toBe(customKeys.tAddress);
    expect(retrieved!.zAddress).toBe(customKeys.zAddress);
  });

  it('should not return empty address strings', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    const manager = new ZcashKeyManager(storage);
    await manager.storeKeys(accountId, testKeys, password);

    const retrieved = await manager.retrieveKeys(accountId, password);

    // CRITICAL: Addresses must not be empty
    expect(retrieved!.tAddress).not.toBe('');
    expect(retrieved!.zAddress).not.toBe('');
    expect(retrieved!.tAddress.length).toBeGreaterThan(0);
    expect(retrieved!.zAddress.length).toBeGreaterThan(0);
  });
});

describe('IndexedDBKeyStorage', () => {
  let storage: IndexedDBKeyStorage;
  let testKeys: ZcashKeys;

  beforeEach(() => {
    // Mock IndexedDB for testing (or use a library like fake-indexeddb)
    storage = new IndexedDBKeyStorage();
    testKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress123',
      zAddress: 'ztestsaplingTestAddress123'
    };
  });

  it('should store and retrieve encrypted keys from IndexedDB', async () => {
    const accountId = 'test-account';
    const password = 'test-password-123';

    const manager = new ZcashKeyManager(storage);

    // Store keys
    await manager.storeKeys(accountId, testKeys, password);

    // Retrieve keys
    const retrieved = await manager.retrieveKeys(accountId, password);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.tAddress).toBe(testKeys.tAddress);
    expect(retrieved!.zAddress).toBe(testKeys.zAddress);
  });

  it('should persist keys across instances (IndexedDB persistence)', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    // First instance - store keys
    const manager1 = new ZcashKeyManager(storage);
    await manager1.storeKeys(accountId, testKeys, password);

    // Retrieve from first instance
    const retrieved1 = await manager1.retrieveKeys(accountId, password);
    expect(retrieved1).not.toBeNull();

    // Create new manager instance (simulating page reload)
    const storage2 = new IndexedDBKeyStorage();
    const manager2 = new ZcashKeyManager(storage2);

    // Keys should still be available from IndexedDB
    const retrieved2 = await manager2.retrieveKeys(accountId, password);

    expect(retrieved2).not.toBeNull();
    expect(retrieved2!.tAddress).toBe(testKeys.tAddress);
    expect(retrieved2!.zAddress).toBe(testKeys.zAddress);
  });

  it('should handle concurrent access safely', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    const manager = new ZcashKeyManager(storage);

    // Store keys
    await manager.storeKeys(accountId, testKeys, password);

    // Try concurrent reads
    const [result1, result2, result3] = await Promise.all([
      manager.retrieveKeys(accountId, password),
      manager.retrieveKeys(accountId, password),
      manager.retrieveKeys(accountId, password)
    ]);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result3).not.toBeNull();
    expect(result1!.tAddress).toBe(result2!.tAddress);
    expect(result2!.tAddress).toBe(result3!.tAddress);
  });

  it('should properly clear keys from IndexedDB', async () => {
    const accountId = 'test-account';
    const password = 'test-password';

    const manager = new ZcashKeyManager(storage);

    // Store keys
    await manager.storeKeys(accountId, testKeys, password);

    // Verify stored
    let retrieved = await manager.retrieveKeys(accountId, password);
    expect(retrieved).not.toBeNull();

    // Clear
    await manager.clearKeys(accountId);

    // Verify cleared
    retrieved = await manager.retrieveKeys(accountId, password);
    expect(retrieved).toBeNull();
  });
});

describe('ZcashKeyManager Integration', () => {
  let storage: MemoryKeyStorage;
  let manager: ZcashKeyManager;

  beforeEach(() => {
    storage = new MemoryKeyStorage();
    manager = new ZcashKeyManager(storage);
  });

  it('should encrypt sensitive key material', async () => {
    const accountId = 'test-account';
    const password = 'test-password';
    const testKeys: ZcashKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress',
      zAddress: 'ztestsaplingTestAddress'
    };

    await manager.storeKeys(accountId, testKeys, password);

    // Try to retrieve with wrong password
    const wrongPassword = await manager.retrieveKeys(
      accountId,
      'wrong-password'
    );

    expect(wrongPassword).toBeNull();
  });

  it('should use PBKDF2 for key derivation', async () => {
    const accountId = 'test-account';
    const password = 'test-password';
    const testKeys: ZcashKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress',
      zAddress: 'ztestsaplingTestAddress'
    };

    // Store same keys with same password twice
    await manager.storeKeys(accountId, testKeys, password);

    // Should use different salt each time (PBKDF2)
    // So the encrypted data should be different
    const storage2 = new MemoryKeyStorage();
    const manager2 = new ZcashKeyManager(storage2);
    await manager2.storeKeys(accountId, testKeys, password);

    // But both should decrypt to the same keys
    const retrieved1 = await manager.retrieveKeys(accountId, password);
    const retrieved2 = await manager2.retrieveKeys(accountId, password);

    expect(retrieved1!.tAddress).toBe(retrieved2!.tAddress);
    expect(retrieved1!.zAddress).toBe(retrieved2!.zAddress);
  });

  it('should handle large key material', async () => {
    const accountId = 'test-account';
    const password = 'test-password';
    const largeTestKeys: ZcashKeys = {
      spendingKey: new Uint8Array(64).fill(1),
      viewingKey: new Uint8Array(64).fill(2),
      transparentPrivateKey: new Uint8Array(64).fill(3),
      tAddress: 'tmTestAddress' + 'x'.repeat(100),
      zAddress: 'ztestsaplingTestAddress' + 'x'.repeat(100)
    };

    await manager.storeKeys(accountId, largeTestKeys, password);

    const retrieved = await manager.retrieveKeys(accountId, password);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.tAddress.length).toBeGreaterThan(50);
    expect(retrieved!.zAddress.length).toBeGreaterThan(50);
  });

  it('should handle special characters in password', async () => {
    const accountId = 'test-account';
    const specialPassword = 'P@ss!w0rd#123&*()[]{}';
    const testKeys: ZcashKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress',
      zAddress: 'ztestsaplingTestAddress'
    };

    await manager.storeKeys(accountId, testKeys, specialPassword);

    const retrieved = await manager.retrieveKeys(accountId, specialPassword);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.tAddress).toBe(testKeys.tAddress);
  });

  it('should handle long passwords', async () => {
    const accountId = 'test-account';
    const longPassword = 'a'.repeat(1000);
    const testKeys: ZcashKeys = {
      spendingKey: new Uint8Array(32).fill(1),
      viewingKey: new Uint8Array(32).fill(2),
      transparentPrivateKey: new Uint8Array(32).fill(3),
      tAddress: 'tmTestAddress',
      zAddress: 'ztestsaplingTestAddress'
    };

    await manager.storeKeys(accountId, testKeys, longPassword);

    const retrieved = await manager.retrieveKeys(accountId, longPassword);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.tAddress).toBe(testKeys.tAddress);
  });
});

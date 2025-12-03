/**
 * Secure Key Storage
 * Implements encrypted storage for Zcash keys using AES-256-GCM
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import type { ZcashKeys } from '../types/index';

/**
 * Encrypted key storage structure
 */
export interface EncryptedKeys {
  spendingKey: string;      // AES-256-GCM encrypted
  viewingKey: string;        // AES-256-GCM encrypted
  transparentKey: string;    // AES-256-GCM encrypted
  iv: string;                // Initialization vector
  salt: string;              // Key derivation salt
  tag: string;               // Authentication tag
  tAddress?: string;         // Transparent address (derived, stored for convenience)
  zAddress?: string;         // Shielded address (derived, stored for convenience)
}

/**
 * Key storage interface
 */
export interface KeyStorage {
  storeEncrypted(
    accountId: string,
    encryptedKeys: EncryptedKeys
  ): Promise<void>;
  
  retrieveEncrypted(accountId: string): Promise<EncryptedKeys | null>;
  
  clearKeys(accountId: string): Promise<void>;
}

/**
 * In-memory key storage implementation
 * In production, this would use secure storage (e.g., browser secure storage)
 */
export class MemoryKeyStorage implements KeyStorage {
  private storage: Map<string, EncryptedKeys> = new Map();

  async storeEncrypted(
    accountId: string,
    encryptedKeys: EncryptedKeys
  ): Promise<void> {
    this.storage.set(accountId, encryptedKeys);
  }

  async retrieveEncrypted(accountId: string): Promise<EncryptedKeys | null> {
    return this.storage.get(accountId) || null;
  }

  async clearKeys(accountId: string): Promise<void> {
    this.storage.delete(accountId);
  }
}

/**
 * IndexedDB key storage implementation
 * Persistent storage for browser environments
 */
export class IndexedDBKeyStorage implements KeyStorage {
  private dbName = 'zcash-wallet-db';
  private storeName = 'encrypted-keys';

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'accountId' });
        }
      };
    });
  }

  async storeEncrypted(
    accountId: string,
    encryptedKeys: EncryptedKeys
  ): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.put({ accountId, ...encryptedKeys });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async retrieveEncrypted(accountId: string): Promise<EncryptedKeys | null> {
    const db = await this.getDB();
    const transaction = db.transaction(this.storeName, 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(accountId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
        } else {
          const { accountId: _, ...encryptedKeys } = result;
          resolve(encryptedKeys);
        }
      };
    });
  }

  async clearKeys(accountId: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(accountId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

/**
 * Key encryption/decryption utilities
 */
export class KeyEncryption {
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly SALT_LENGTH = 16;

  /**
   * Encrypt a key using AES-256-GCM
   */
  static async encryptKey(
    key: Uint8Array,
    password: string
  ): Promise<EncryptedKey> {
    // 1. Generate salt
    const salt = this.generateRandomBytes(this.SALT_LENGTH);
    
    // 2. Derive encryption key from password
    const encryptionKey = await this.deriveKey(password, salt);
    
    // 3. Generate IV
    const iv = this.generateRandomBytes(this.IV_LENGTH);
    
    // 4. Encrypt with AES-256-GCM
    // Browser Web Crypto API would be used in production
    const encrypted = await this.aes256gcmEncrypt(key, encryptionKey, iv);
    
    // 5. Extract authentication tag
    const tag = encrypted.slice(-16); // Last 16 bytes are the tag
    const ciphertext = encrypted.slice(0, -16);
    
    return {
      encrypted: this.bytesToBase64(ciphertext),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(salt),
      tag: this.bytesToBase64(tag)
    };
  }

  /**
   * Decrypt a key using AES-256-GCM
   */
  static async decryptKey(
    encryptedKey: EncryptedKey,
    password: string
  ): Promise<Uint8Array> {
    // 1. Decode from base64
    const encrypted = this.base64ToBytes(encryptedKey.encrypted);
    const iv = this.base64ToBytes(encryptedKey.iv);
    const salt = this.base64ToBytes(encryptedKey.salt);
    const tag = this.base64ToBytes(encryptedKey.tag);
    
    // 2. Derive encryption key
    const encryptionKey = await this.deriveKey(password, salt);
    
    // 3. Combine ciphertext and tag
    const ciphertextWithTag = new Uint8Array(encrypted.length + tag.length);
    ciphertextWithTag.set(encrypted);
    ciphertextWithTag.set(tag, encrypted.length);
    
    // 4. Decrypt
    return await this.aes256gcmDecrypt(ciphertextWithTag, encryptionKey, iv);
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private static async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    const passwordBytes = new TextEncoder().encode(password);
    return pbkdf2(sha256, passwordBytes, salt, {
      c: this.PBKDF2_ITERATIONS,
      dkLen: this.KEY_LENGTH
    });
  }

  /**
   * Encrypt using AES-256-GCM (Web Crypto API)
   */
  private static async aes256gcmEncrypt(
    data: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv)
      },
      cryptoKey,
      new Uint8Array(data)
    );

    return new Uint8Array(encrypted);
  }

  /**
   * Decrypt using AES-256-GCM (Web Crypto API)
   */
  private static async aes256gcmDecrypt(
    data: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv)
      },
      cryptoKey,
      new Uint8Array(data)
    );

    return new Uint8Array(decrypted);
  }

  /**
   * Generate random bytes
   */
  private static generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Convert bytes to base64
   */
  private static bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert base64 to bytes
   */
  private static base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    return new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
  }
}

/**
 * Encrypted key structure (single key)
 */
export interface EncryptedKey {
  encrypted: string;
  iv: string;
  salt: string;
  tag: string;
}

/**
 * Key manager that handles encryption/decryption and storage
 */
export class ZcashKeyManager {
  private storage: KeyStorage;
  private encryption: typeof KeyEncryption;

  constructor(storage: KeyStorage = new MemoryKeyStorage()) {
    this.storage = storage;
    this.encryption = KeyEncryption;
  }

  /**
   * Store Zcash keys encrypted
   */
  async storeKeys(
    accountId: string,
    keys: ZcashKeys,
    password: string
  ): Promise<void> {
    // Encrypt each key
    const [spendingKey, viewingKey, transparentKey] = await Promise.all([
      this.encryption.encryptKey(keys.spendingKey, password),
      this.encryption.encryptKey(keys.viewingKey, password),
      this.encryption.encryptKey(keys.transparentPrivateKey, password)
    ]);

    // Store encrypted keys with addresses for quick retrieval
    const encryptedKeys: EncryptedKeys = {
      spendingKey: JSON.stringify(spendingKey),
      viewingKey: JSON.stringify(viewingKey),
      transparentKey: JSON.stringify(transparentKey),
      iv: spendingKey.iv, // Using first IV as reference
      salt: spendingKey.salt,
      tag: spendingKey.tag,
      tAddress: keys.tAddress, // Store addresses for quick access
      zAddress: keys.zAddress
    };

    await this.storage.storeEncrypted(accountId, encryptedKeys);
  }

  /**
   * Retrieve and decrypt Zcash keys
   */
  async retrieveKeys(
    accountId: string,
    password: string
  ): Promise<ZcashKeys | null> {
    const encrypted = await this.storage.retrieveEncrypted(accountId);
    if (!encrypted) {
      return null;
    }

    // Decrypt each key
    const [spendingKey, viewingKey, transparentKey] = await Promise.all([
      this.encryption.decryptKey(JSON.parse(encrypted.spendingKey), password),
      this.encryption.decryptKey(JSON.parse(encrypted.viewingKey), password),
      this.encryption.decryptKey(JSON.parse(encrypted.transparentKey), password)
    ]);

    // Return keys with addresses (stored during encryption)
    return {
      spendingKey,
      viewingKey,
      transparentPrivateKey: transparentKey,
      tAddress: encrypted.tAddress || '',
      zAddress: encrypted.zAddress || ''
    };
  }

  /**
   * Clear stored keys
   */
  async clearKeys(accountId: string): Promise<void> {
    await this.storage.clearKeys(accountId);
  }
}



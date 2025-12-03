/**
 * Note Cache Persistence Layer
 * Provides IndexedDB-backed auto-persistence for NoteCache
 * Falls back to in-memory storage for testing environments
 */

import { NoteCache } from './noteCache.js';
// Type imports used in method signatures (addNote, updateWitness, etc.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ScannedNote, MerkleWitness, CommitmentTreeState } from './types.js';
import { bytesToHex, hexToBytes } from '../utils/bytes';

/**
 * IndexedDB configuration
 */
const DB_NAME = 'miden-zcash-notes';
const DB_VERSION = 1;
const STORE_NAME = 'notecache';
const CACHE_KEY = 'cache-state';

/**
 * In-memory storage backend for testing environments
 */
class InMemoryStorage {
  private store: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.store.get(key) || null;
  }

  async put(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Storage backend interface
 */
interface StorageBackend {
  get(key: string): Promise<any>;
  put(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * IndexedDB storage backend
 */
class IndexedDBStorage implements StorageBackend {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async get(key: string): Promise<any> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => {
        reject(new Error(`Failed to read from database: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async put(key: string, value: any): Promise<void> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onerror = () => {
        reject(new Error(`Failed to write to database: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => {
        reject(new Error(`Failed to delete from database: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        reject(new Error(`Failed to clear database: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onerror = () => {
        reject(new Error(`Failed to delete database: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = null;
        resolve();
      };
    });
  }
}

/**
 * Persistent Note Cache with auto-save
 * Wraps NoteCache with automatic persistence on modifications
 * Uses IndexedDB in browser, in-memory storage in Node.js
 */
export class PersistentNoteCache {
  private cache: NoteCache;
  private storage: StorageBackend;
  private initialized: boolean = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000; // Wait 1 second before saving
  private isSaving: boolean = false;

  constructor(cache: NoteCache = new NoteCache(), storage?: StorageBackend) {
    this.cache = cache;
    // Use provided storage, or auto-detect (IndexedDB in browser, in-memory in Node.js)
    if (storage) {
      this.storage = storage;
    } else if (typeof indexedDB !== 'undefined') {
      this.storage = new IndexedDBStorage();
    } else {
      this.storage = new InMemoryStorage();
    }
  }

  /**
   * Initialize the persistence layer
   * Opens storage backend and loads cached state
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize IndexedDB if available
      if (this.storage instanceof IndexedDBStorage) {
        await (this.storage as IndexedDBStorage).initialize();
      }

      await this.loadFromStorage();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Persistent cache initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if persistence is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Load cache state from storage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const state = await this.storage.get(CACHE_KEY);
      if (state) {
        this.cache.import(state);
      }
    } catch (error) {
      // Continue with empty cache if load fails
    }
  }

  /**
   * Save cache state to storage (debounced)
   */
  private async saveToStorage(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Clear existing debounce timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Schedule save with debounce
    this.saveDebounceTimer = setTimeout(async () => {
      if (this.isSaving) {
        return; // Skip if already saving
      }

      this.isSaving = true;
      try {
        const state = this.cache.export();
        await this.storage.put(CACHE_KEY, state);
      } catch (error) {
        // Failed to save cache to storage
      } finally {
        this.isSaving = false;
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Add a note to the cache and persist
   */
  addNote(scannedNote: ScannedNote): void {
    this.cache.addNote(scannedNote);
    this.saveToStorage();
  }

  /**
   * Add multiple notes and persist
   */
  addNotes(notes: ScannedNote[]): void {
    this.cache.addNotes(notes);
    this.saveToStorage();
  }

  /**
   * Get note by commitment
   */
  getNoteByCommitment(commitment: Uint8Array) {
    return this.cache.getNoteByCommitment(commitment);
  }

  /**
   * Get note by nullifier
   */
  getNoteByNullifier(nullifier: Uint8Array) {
    return this.cache.getNoteByNullifier(nullifier);
  }

  /**
   * Get all notes for an address
   */
  getNotesForAddress(address: string) {
    return this.cache.getNotesForAddress(address);
  }

  /**
   * Get spendable notes for an address
   */
  getSpendableNotes(address: string, minConfirmations?: number) {
    return this.cache.getSpendableNotes(address, minConfirmations);
  }

  /**
   * Get balance for an address
   */
  getBalance(address: string) {
    return this.cache.getBalance(address);
  }

  /**
   * Mark a nullifier as spent and persist
   */
  markSpent(nullifier: Uint8Array): void {
    this.cache.markSpent(nullifier);
    this.saveToStorage();
  }

  /**
   * Mark multiple nullifiers as spent and persist
   */
  markSpentBatch(nullifiers: Uint8Array[]): void {
    this.cache.markSpentBatch(nullifiers);
    this.saveToStorage();
  }

  /**
   * Check if nullifier is spent
   */
  isSpent(nullifier: Uint8Array): boolean {
    return this.cache.isSpent(nullifier);
  }

  /**
   * Update witness for a note and persist
   */
  updateWitness(commitment: Uint8Array, witness: MerkleWitness): void {
    this.cache.updateWitness(commitment, witness);
    this.saveToStorage();
  }

  /**
   * Update tree state and persist
   */
  updateTreeState(state: CommitmentTreeState): void {
    this.cache.updateTreeState(state);
    this.saveToStorage();
  }

  /**
   * Get current tree state
   */
  getTreeState(): CommitmentTreeState | null {
    return this.cache.getTreeState();
  }

  /**
   * Get synced height for address
   */
  getSyncedHeight(address: string): number {
    return this.cache.getSyncedHeight(address);
  }

  /**
   * Update synced height and persist
   */
  updateSyncedHeight(address: string, height: number): void {
    this.cache.updateSyncedHeight(address, height);
    this.saveToStorage();
  }

  /**
   * Get all addresses with notes
   */
  getAddresses(): string[] {
    return this.cache.getAddresses();
  }

  /**
   * Get note count
   */
  getNoteCount(): number {
    return this.cache.getNoteCount();
  }

  /**
   * Get spent nullifier count
   */
  getSpentCount(): number {
    return this.cache.getSpentCount();
  }

  /**
   * Remove notes below a certain block height and persist
   */
  revertToHeight(height: number): void {
    this.cache.revertToHeight(height);
    this.saveToStorage();
  }

  /**
   * Clear all cached data and persist
   */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.saveToStorage();
    // Force immediate save on clear
    await this.forceSync();
  }

  /**
   * Force immediate synchronization to storage
   * Useful when you need guaranteed persistence before proceeding
   */
  async forceSync(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Clear any pending saves
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    // Wait for any in-progress save
    let attempts = 0;
    while (this.isSaving && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 10));
      attempts++;
    }

    // Perform synchronous save
    try {
      const state = this.cache.export();
      await this.storage.put(CACHE_KEY, state);
    } catch (error) {
      // Force sync failed
      throw error;
    }
  }

  /**
   * Delete the database (for testing/reset)
   */
  async deleteDatabase(): Promise<void> {
    if (this.storage instanceof IndexedDBStorage) {
      await (this.storage as IndexedDBStorage).deleteDatabase();
    }
    this.initialized = false;
  }

  /**
   * Get the underlying NoteCache for advanced operations
   */
  getCache(): NoteCache {
    return this.cache;
  }
}

/**
 * Global persistent cache instance
 */
let globalPersistentCache: PersistentNoteCache | null = null;

/**
 * Get or create the global persistent cache instance
 */
export async function getOrCreatePersistentCache(): Promise<PersistentNoteCache> {
  if (!globalPersistentCache) {
    globalPersistentCache = new PersistentNoteCache();
    await globalPersistentCache.initialize();
  }
  return globalPersistentCache;
}

/**
 * Reset the global persistent cache (for testing)
 */
export async function resetPersistentCache(): Promise<void> {
  if (globalPersistentCache) {
    await globalPersistentCache.deleteDatabase();
    globalPersistentCache = null;
  }
}

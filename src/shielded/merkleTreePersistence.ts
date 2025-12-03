/**
 * Merkle Tree Persistence
 * Saves/loads merkle tree state to IndexedDB
 * 
 * This enables fast resync by persisting the tree state
 * First sync: 1-2 hours (full blockchain scan)
 * Subsequent syncs: seconds (load from cache, sync delta)
 */

import { IncrementalMerkleTree } from './noteScanner.js';

const MERKLE_TREE_DB = 'zcash-merkle-trees';
const MERKLE_TREE_STORE = 'trees';
const DB_VERSION = 1;

/**
 * Checkpoint structure for persisted tree state
 */
export interface TreeCheckpoint {
  /** All leaves in the tree */
  leaves: Uint8Array[];
  /** Block height at which this checkpoint was taken */
  height: number;
  /** Timestamp when checkpoint was saved */
  timestamp: number;
  /** Tree depth */
  depth: number;
}

/**
 * Merkle Tree Persistence Manager
 * Handles saving and loading tree state to/from IndexedDB
 */
export class MerkleTreePersistence {
  /**
   * Save tree state to IndexedDB
   * 
   * @param treeId - Unique identifier for this tree (e.g., "tree-{address}")
   * @param tree - The IncrementalMerkleTree to save
   * @param currentHeight - Current block height
   */
  static async saveTree(
    treeId: string,
    tree: IncrementalMerkleTree,
    currentHeight: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
          db.createObjectStore(MERKLE_TREE_STORE);
        }
      };

      request.onsuccess = () => {
        try {
          const db = request.result;
          const transaction = db.transaction(MERKLE_TREE_STORE, 'readwrite');
          const store = transaction.objectStore(MERKLE_TREE_STORE);

          // Access private leaves via bracket notation (TypeScript workaround)
          const checkpoint: TreeCheckpoint = {
            leaves: (tree as any)['leaves'] || [],
            height: currentHeight,
            timestamp: Date.now(),
            depth: (tree as any)['depth'] || 32
          };

          const putRequest = store.put(checkpoint, treeId);

          putRequest.onsuccess = () => {
            db.close();
            resolve();
          };

          putRequest.onerror = () => {
            db.close();
            reject(putRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load tree state from IndexedDB
   * 
   * @param treeId - Unique identifier for the tree
   * @returns Tree and last synced height, or null if not found
   */
  static async loadTree(treeId: string): Promise<{
    tree: IncrementalMerkleTree;
    height: number;
  } | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
          db.createObjectStore(MERKLE_TREE_STORE);
        }
      };

      request.onsuccess = () => {
        try {
          const db = request.result;

          if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
            db.close();
            resolve(null);
            return;
          }

          const transaction = db.transaction(MERKLE_TREE_STORE, 'readonly');
          const store = transaction.objectStore(MERKLE_TREE_STORE);
          const getRequest = store.get(treeId);

          getRequest.onsuccess = () => {
            const checkpoint = getRequest.result as TreeCheckpoint | undefined;
            db.close();

            if (!checkpoint) {
              resolve(null);
              return;
            }

            // Reconstruct the tree from checkpoint
            const tree = new IncrementalMerkleTree(checkpoint.depth || 32);
            
            // Restore leaves by appending each one
            // This triggers proper tree structure rebuilding
            for (const leaf of checkpoint.leaves) {
              tree.append(leaf);
            }

            resolve({
              tree,
              height: checkpoint.height
            });
          };

          getRequest.onerror = () => {
            db.close();
            reject(getRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear a specific tree from storage
   * 
   * @param treeId - Unique identifier for the tree to clear
   */
  static async clearTree(treeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
          db.createObjectStore(MERKLE_TREE_STORE);
        }
      };

      request.onsuccess = () => {
        try {
          const db = request.result;

          if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
            db.close();
            resolve();
            return;
          }

          const transaction = db.transaction(MERKLE_TREE_STORE, 'readwrite');
          const store = transaction.objectStore(MERKLE_TREE_STORE);
          const deleteRequest = store.delete(treeId);

          deleteRequest.onsuccess = () => {
            db.close();
            resolve();
          };

          deleteRequest.onerror = () => {
            db.close();
            reject(deleteRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all trees from storage
   */
  static async clearAllTrees(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onsuccess = () => {
        try {
          const db = request.result;

          if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
            db.close();
            resolve();
            return;
          }

          const transaction = db.transaction(MERKLE_TREE_STORE, 'readwrite');
          const store = transaction.objectStore(MERKLE_TREE_STORE);
          const clearRequest = store.clear();

          clearRequest.onsuccess = () => {
            db.close();
            resolve();
          };

          clearRequest.onerror = () => {
            db.close();
            reject(clearRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all stored tree IDs
   */
  static async listTrees(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
          db.createObjectStore(MERKLE_TREE_STORE);
        }
      };

      request.onsuccess = () => {
        try {
          const db = request.result;

          if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
            db.close();
            resolve([]);
            return;
          }

          const transaction = db.transaction(MERKLE_TREE_STORE, 'readonly');
          const store = transaction.objectStore(MERKLE_TREE_STORE);
          const keysRequest = store.getAllKeys();

          keysRequest.onsuccess = () => {
            db.close();
            resolve(keysRequest.result as string[]);
          };

          keysRequest.onerror = () => {
            db.close();
            reject(keysRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get checkpoint info without loading full tree
   */
  static async getCheckpointInfo(treeId: string): Promise<{
    height: number;
    timestamp: number;
    leafCount: number;
  } | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MERKLE_TREE_DB, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
          db.createObjectStore(MERKLE_TREE_STORE);
        }
      };

      request.onsuccess = () => {
        try {
          const db = request.result;

          if (!db.objectStoreNames.contains(MERKLE_TREE_STORE)) {
            db.close();
            resolve(null);
            return;
          }

          const transaction = db.transaction(MERKLE_TREE_STORE, 'readonly');
          const store = transaction.objectStore(MERKLE_TREE_STORE);
          const getRequest = store.get(treeId);

          getRequest.onsuccess = () => {
            const checkpoint = getRequest.result as TreeCheckpoint | undefined;
            db.close();

            if (!checkpoint) {
              resolve(null);
              return;
            }

            resolve({
              height: checkpoint.height,
              timestamp: checkpoint.timestamp,
              leafCount: checkpoint.leaves.length
            });
          };

          getRequest.onerror = () => {
            db.close();
            reject(getRequest.error);
          };
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

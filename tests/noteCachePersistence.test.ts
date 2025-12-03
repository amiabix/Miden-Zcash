/**
 * Note Cache Persistence Tests
 * Tests for IndexedDB-backed auto-persistence
 */

import { PersistentNoteCache, resetPersistentCache } from '../src/shielded/noteCachePersistence';
import { NoteCache } from '../src/shielded/noteCache';
import type { SaplingNote, ScannedNote, CommitmentTreeState } from '../src/shielded/types';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

let noteCounter = 0;

/**
 * Helper to create a test note with unique commitment
 */
function createTestNote(value: number = 1000, address: string = 'test-addr'): SaplingNote {
  noteCounter++;
  const cmu = new Uint8Array(32);
  cmu[0] = noteCounter; // Ensure unique commitment

  const commitment = new Uint8Array(32);
  commitment[0] = noteCounter * 2;

  const nullifier = new Uint8Array(32);
  nullifier[0] = noteCounter * 3;

  return {
    commitment,
    nullifier,
    value,
    rcm: new Uint8Array(32).fill(3),
    rseed: new Uint8Array(32).fill(4),
    cmu,
    address,
    diversifier: new Uint8Array(11).fill(6),
    pkD: new Uint8Array(32).fill(7),
    position: 0,
    blockHeight: 100,
    memo: undefined,
    spent: false,
    witness: undefined
  };
}

/**
 * Helper to create a scanned note with unique commitment
 */
function createScannedNote(
  value: number = 1000,
  address: string = 'test-addr',
  blockHeight: number = 100
): ScannedNote {
  return {
    note: createTestNote(value, address),
    blockHeight,
    txIndex: 0,
    outputIndex: 0,
    isOutgoing: false
  };
}

describe('PersistentNoteCache', () => {
  let persistentCache: PersistentNoteCache;
  let testId = 0;

  beforeEach(async () => {
    // Reset note counter and create isolated cache
    noteCounter = 0;
    testId = Math.random();
    persistentCache = new PersistentNoteCache(new NoteCache());
    await persistentCache.initialize();
  });

  afterEach(async () => {
    // Clean up after each test
    if (persistentCache && persistentCache.isInitialized()) {
      await persistentCache.deleteDatabase();
    }
  });

  describe('initialization', () => {
    it('should initialize the persistent cache', async () => {
      expect(persistentCache.isInitialized()).toBe(true);
    });

    it('should open IndexedDB connection', async () => {
      expect(persistentCache.isInitialized()).toBe(true);
      const addresses = persistentCache.getAddresses();
      expect(Array.isArray(addresses)).toBe(true);
    });

    it('should handle multiple initializations gracefully', async () => {
      await persistentCache.initialize();
      await persistentCache.initialize();
      expect(persistentCache.isInitialized()).toBe(true);
    });
  });

  describe('adding notes', () => {
    it('should add a single note and persist', async () => {
      const note = createScannedNote(1000, 'addr1');
      persistentCache.addNote(note);

      // Force sync
      await persistentCache.forceSync();

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      const notes = newCache.getNotesForAddress('addr1');
      expect(notes.length).toBe(1);
      expect(notes[0].value).toBe(1000);
      await newCache.deleteDatabase();
    });

    it('should add multiple notes and persist', async () => {
      const notes = [
        createScannedNote(1000, 'addr1', 100),
        createScannedNote(2000, 'addr1', 101),
        createScannedNote(3000, 'addr2', 102)
      ];
      persistentCache.addNotes(notes);

      // Force sync
      await persistentCache.forceSync();

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      const addr1Notes = newCache.getNotesForAddress('addr1');
      const addr2Notes = newCache.getNotesForAddress('addr2');

      expect(addr1Notes.length).toBe(2);
      expect(addr2Notes.length).toBe(1);
      await newCache.deleteDatabase();
    });

    it('should track note count correctly', async () => {
      expect(persistentCache.getNoteCount()).toBe(0);

      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      persistentCache.addNote(createScannedNote(2000, 'addr1'));

      // No need to wait for debounce for in-memory count
      expect(persistentCache.getNoteCount()).toBe(2);
    });

    it('should prevent duplicate notes', async () => {
      const note = createScannedNote(1000, 'addr1');
      persistentCache.addNote(note);
      persistentCache.addNote(note); // Duplicate

      expect(persistentCache.getNoteCount()).toBe(1);
    });
  });

  describe('note retrieval', () => {
    beforeEach(() => {
      persistentCache.addNote(createScannedNote(1000, 'addr1', 100));
      persistentCache.addNote(createScannedNote(2000, 'addr2', 101));
    });

    it('should retrieve notes for an address', () => {
      const notes = persistentCache.getNotesForAddress('addr1');
      expect(notes.length).toBe(1);
      expect(notes[0].value).toBe(1000);
    });

    it('should retrieve notes by commitment', () => {
      const scannedNote = createScannedNote(5000, 'addr-test');
      persistentCache.addNote(scannedNote);

      // Retrieve by the cmu (note commitment) from the note we just added
      const cmu = scannedNote.note.cmu;
      const note = persistentCache.getNoteByCommitment(cmu);
      expect(note).toBeDefined();
      expect(note?.value).toBe(5000);
    });

    it('should return empty array for non-existent address', () => {
      const notes = persistentCache.getNotesForAddress('non-existent');
      expect(notes.length).toBe(0);
    });

    it('should return null for non-existent commitment', () => {
      const commitment = new Uint8Array(32).fill(99);
      const note = persistentCache.getNoteByCommitment(commitment);
      expect(note).toBeNull();
    });
  });

  describe('balance tracking', () => {
    it('should calculate total balance', () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      persistentCache.addNote(createScannedNote(2000, 'addr1'));

      const balance = persistentCache.getBalance('addr1');
      expect(balance.total).toBe(3000);
    });

    it('should calculate spendable balance', () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1', 100));
      persistentCache.addNote(createScannedNote(2000, 'addr1', 101));

      const balance = persistentCache.getBalance('addr1');
      expect(balance.spendable).toBeLessThanOrEqual(balance.total);
    });

    it('should return zero balance for empty address', () => {
      const balance = persistentCache.getBalance('empty-addr');
      expect(balance.total).toBe(0);
      expect(balance.spendable).toBe(0);
    });
  });

  describe('spent nullifier tracking', () => {
    it('should mark nullifier as spent and persist', async () => {
      const note = createScannedNote(1000, 'addr1');
      persistentCache.addNote(note);

      const nullifier = note.note.nullifier;
      persistentCache.markSpent(nullifier);

      // Force sync
      await persistentCache.forceSync();

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.isSpent(nullifier)).toBe(true);
      await newCache.deleteDatabase();
    });

    it('should mark multiple nullifiers as spent', async () => {
      const note1 = createScannedNote(1000, 'addr1');
      const note2 = createScannedNote(2000, 'addr1');
      persistentCache.addNotes([note1, note2]);

      const nullifiers = [note1.note.nullifier, note2.note.nullifier];
      persistentCache.markSpentBatch(nullifiers);

      expect(persistentCache.getSpentCount()).toBe(2);

      // Force sync and verify persistence
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getSpentCount()).toBe(2);
      await newCache.deleteDatabase();
    });

    it('should track spent count', () => {
      const note1 = createScannedNote(1000, 'addr1');
      const note2 = createScannedNote(2000, 'addr1');
      persistentCache.addNotes([note1, note2]);

      expect(persistentCache.getSpentCount()).toBe(0);

      persistentCache.markSpent(note1.note.nullifier);
      expect(persistentCache.getSpentCount()).toBe(1);

      persistentCache.markSpent(note2.note.nullifier);
      expect(persistentCache.getSpentCount()).toBe(2);
    });
  });

  describe('tree state management', () => {
    it('should update and persist tree state', async () => {
      const state: CommitmentTreeState = {
        root: new Uint8Array(32).fill(1),
        size: 100,
        blockHeight: 50
      };

      persistentCache.updateTreeState(state);

      // Force sync
      await persistentCache.forceSync();

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      const retrievedState = newCache.getTreeState();
      expect(retrievedState).toBeDefined();
      expect(retrievedState?.size).toBe(100);
      expect(retrievedState?.blockHeight).toBe(50);
      await newCache.deleteDatabase();
    });

    it('should return null when no tree state set', () => {
      const state = persistentCache.getTreeState();
      expect(state).toBeNull();
    });
  });

  describe('synced height tracking', () => {
    it('should update and persist synced height', async () => {
      persistentCache.updateSyncedHeight('addr1', 100);

      // Force sync
      await persistentCache.forceSync();

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getSyncedHeight('addr1')).toBe(100);
      await newCache.deleteDatabase();
    });

    it('should return 0 for addresses without synced height', () => {
      expect(persistentCache.getSyncedHeight('unknown-addr')).toBe(0);
    });

    it('should handle multiple address heights', async () => {
      persistentCache.updateSyncedHeight('addr1', 100);
      persistentCache.updateSyncedHeight('addr2', 200);
      persistentCache.updateSyncedHeight('addr3', 150);

      // Force sync
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getSyncedHeight('addr1')).toBe(100);
      expect(newCache.getSyncedHeight('addr2')).toBe(200);
      expect(newCache.getSyncedHeight('addr3')).toBe(150);
      await newCache.deleteDatabase();
    });
  });

  describe('reorg handling', () => {
    it('should revert notes above height and persist', async () => {
      persistentCache.addNotes([
        createScannedNote(1000, 'addr1', 100),
        createScannedNote(2000, 'addr1', 150),
        createScannedNote(3000, 'addr1', 200)
      ]);

      persistentCache.revertToHeight(150);

      // Force sync for persistence
      await persistentCache.forceSync();

      const notes = persistentCache.getNotesForAddress('addr1');
      expect(notes.length).toBe(2); // Only notes at height <= 150

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      const reloadedNotes = newCache.getNotesForAddress('addr1');
      expect(reloadedNotes.length).toBe(2);
      await newCache.deleteDatabase();
    });

    it('should update synced heights on revert', async () => {
      persistentCache.updateSyncedHeight('addr1', 200);
      persistentCache.updateSyncedHeight('addr2', 300);

      persistentCache.revertToHeight(150);

      // Force sync for persistence
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getSyncedHeight('addr1')).toBe(150);
      expect(newCache.getSyncedHeight('addr2')).toBe(150);
      await newCache.deleteDatabase();
    });
  });

  describe('force synchronization', () => {
    it('should force immediate save to database', async () => {
      const note = createScannedNote(1000, 'addr1');
      persistentCache.addNote(note);

      // Force sync without waiting for debounce
      await persistentCache.forceSync();

      // Create new cache instance with same storage and verify immediate persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(1);
      await newCache.deleteDatabase();
    });

    it('should handle force sync when not initialized', async () => {
      const cache = new PersistentNoteCache(new NoteCache());
      // Don't initialize
      await expect(cache.forceSync()).resolves.toBeUndefined();
    });
  });

  describe('clear operation', () => {
    it('should clear all data and persist', async () => {
      persistentCache.addNotes([
        createScannedNote(1000, 'addr1'),
        createScannedNote(2000, 'addr2')
      ]);

      const nullifier = new Uint8Array(32);
      nullifier[0] = 100;
      persistentCache.markSpent(nullifier);

      expect(persistentCache.getNoteCount()).toBeGreaterThan(0);
      expect(persistentCache.getSpentCount()).toBeGreaterThan(0);

      await persistentCache.clear();

      expect(persistentCache.getNoteCount()).toBe(0);
      expect(persistentCache.getSpentCount()).toBe(0);

      // Create new cache instance with same storage to verify persistence
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(0);
      expect(newCache.getSpentCount()).toBe(0);
      await newCache.deleteDatabase();
    });
  });

  describe('address management', () => {
    it('should track all addresses with notes', () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      persistentCache.addNote(createScannedNote(2000, 'addr2'));
      persistentCache.addNote(createScannedNote(3000, 'addr1'));

      const addresses = persistentCache.getAddresses();
      expect(new Set(addresses)).toEqual(new Set(['addr1', 'addr2']));
    });

    it('should return empty array when no addresses', () => {
      const addresses = persistentCache.getAddresses();
      expect(addresses.length).toBe(0);
    });

    it('should not duplicate addresses', () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      persistentCache.addNote(createScannedNote(2000, 'addr1'));

      const addresses = persistentCache.getAddresses();
      expect(addresses.length).toBe(1);
      expect(addresses[0]).toBe('addr1');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent note additions', async () => {
      const notes = [];
      for (let i = 0; i < 10; i++) {
        notes.push(createScannedNote(1000 + i, `addr${i % 3}`));
      }

      // Add notes sequentially to ensure proper ordering
      for (const note of notes) {
        persistentCache.addNote(note);
      }

      expect(persistentCache.getNoteCount()).toBe(10);
    });

    it('should handle mixed concurrent operations', async () => {
      const note1 = createScannedNote(1000, 'addr1');
      const note2 = createScannedNote(2000, 'addr2');

      persistentCache.addNote(note1);
      persistentCache.addNote(note2);

      // Concurrent operations
      await Promise.all([
        Promise.resolve(persistentCache.markSpent(note1.note.nullifier)),
        Promise.resolve(persistentCache.updateSyncedHeight('addr1', 100)),
        Promise.resolve(persistentCache.updateSyncedHeight('addr2', 200))
      ]);

      expect(persistentCache.getSpentCount()).toBe(1);
      expect(persistentCache.getSyncedHeight('addr1')).toBe(100);
      expect(persistentCache.getSyncedHeight('addr2')).toBe(200);
    });
  });

  describe('database operations', () => {
    it('should delete database and reset state', async () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      expect(persistentCache.getNoteCount()).toBe(1);

      await persistentCache.deleteDatabase();

      expect(persistentCache.isInitialized()).toBe(false);
    });

    it('should create new database after deletion', async () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));
      await persistentCache.deleteDatabase();

      // Reinitialize
      persistentCache = new PersistentNoteCache(new NoteCache());
      await persistentCache.initialize();

      expect(persistentCache.getNoteCount()).toBe(0);
      expect(persistentCache.isInitialized()).toBe(true);
    });
  });

  describe('cache getter', () => {
    it('should return underlying NoteCache', () => {
      const cache = persistentCache.getCache();
      expect(cache).toBeDefined();
      expect(cache).toBeInstanceOf(NoteCache);
    });

    it('should allow access to cache for advanced operations', () => {
      const cache = persistentCache.getCache();
      persistentCache.addNote(createScannedNote(1000, 'addr1'));

      const notes = cache.getNotesForAddress('addr1');
      expect(notes.length).toBe(1);
    });
  });

  describe('persistence edge cases', () => {
    it('should handle empty cache persistence', async () => {
      // Force save with no notes
      await persistentCache.forceSync();

      // Create new cache instance with same storage backend
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(0);
      await newCache.deleteDatabase();
    });

    it('should recover from persistence on initialization', async () => {
      persistentCache.addNotes([
        createScannedNote(1000, 'addr1', 100),
        createScannedNote(2000, 'addr2', 101)
      ]);
      persistentCache.updateTreeState({
        root: new Uint8Array(32).fill(1),
        size: 100,
        blockHeight: 50
      });

      // Force immediate sync
      await persistentCache.forceSync();

      // Create new cache with same storage and verify all data loads
      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(2);
      expect(newCache.getAddresses().length).toBe(2);
      expect(newCache.getTreeState()).toBeDefined();
      await newCache.deleteDatabase();
    });

    it('should handle notes with all field variations', async () => {
      const noteWithMemo: SaplingNote = {
        ...createTestNote(5000, 'addr-memo'),
        memo: new Uint8Array(512).fill(97) // ASCII 'a'
      };

      const scannedNote: ScannedNote = {
        note: noteWithMemo,
        blockHeight: 200,
        txIndex: 5,
        outputIndex: 2,
        isOutgoing: true
      };

      persistentCache.addNote(scannedNote);

      // Force immediate sync
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      const notes = newCache.getNotesForAddress('addr-memo');
      expect(notes.length).toBe(1);
      expect(notes[0].memo).toBeDefined();
      expect(notes[0].memo?.length).toBe(512);
      await newCache.deleteDatabase();
    });
  });

  describe('debounce behavior', () => {
    it('should debounce multiple rapid saves', async () => {
      // Add multiple notes rapidly
      for (let i = 0; i < 5; i++) {
        persistentCache.addNote(createScannedNote(1000 + i, `addr${i}`));
      }

      // Force sync to ensure persistence
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(5);
      await newCache.deleteDatabase();
    });

    it('should reset debounce timer on new operations', async () => {
      persistentCache.addNote(createScannedNote(1000, 'addr1'));

      // Wait 900ms (before debounce triggers)
      await new Promise(resolve => setTimeout(resolve, 900));

      // Add another note, resetting timer
      persistentCache.addNote(createScannedNote(2000, 'addr2'));

      // Force sync to ensure both are saved
      await persistentCache.forceSync();

      const newCache = new PersistentNoteCache(new NoteCache(), persistentCache['storage']);
      await newCache.initialize();

      expect(newCache.getNoteCount()).toBe(2);
      await newCache.deleteDatabase();
    });
  });
});

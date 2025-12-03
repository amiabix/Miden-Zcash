/**
 * Note Cache Tests
 */

import { NoteCache, NoteSelector } from '../../src/shielded/noteCache';
import type { SaplingNote, ScannedNote, MerkleWitness } from '../../src/shielded/types';
import { bytesToHex } from '../../src/utils/bytes';

function createMockNote(overrides: Partial<SaplingNote> = {}): SaplingNote {
  return {
    commitment: new Uint8Array(32).fill(1),
    nullifier: new Uint8Array(32).fill(2),
    value: 100000,
    rcm: new Uint8Array(32).fill(3),
    rseed: new Uint8Array(32).fill(4),
    cmu: overrides.cmu || new Uint8Array(32).fill(5),
    address: overrides.address || 'zs1testaddress',
    diversifier: new Uint8Array(11).fill(6),
    pkD: new Uint8Array(32).fill(7),
    spent: false,
    ...overrides
  };
}

function createMockWitness(): MerkleWitness {
  return {
    authPath: Array(32).fill(new Uint8Array(32)),
    position: 12345n
  };
}

describe('NoteCache', () => {
  let cache: NoteCache;

  beforeEach(() => {
    cache = new NoteCache();
  });

  describe('addNote', () => {
    test('adds note to cache', () => {
      const note = createMockNote();
      const scannedNote: ScannedNote = {
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      };

      cache.addNote(scannedNote);

      expect(cache.getNoteCount()).toBe(1);
    });

    test('does not add duplicate notes', () => {
      const note = createMockNote();
      const scannedNote: ScannedNote = {
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      };

      cache.addNote(scannedNote);
      cache.addNote(scannedNote);

      expect(cache.getNoteCount()).toBe(1);
    });
  });

  describe('getNoteByCommitment', () => {
    test('returns note by commitment', () => {
      const cmu = new Uint8Array(32).fill(99);
      const note = createMockNote({ cmu });
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });

      const retrieved = cache.getNoteByCommitment(cmu);

      expect(retrieved).not.toBeNull();
      expect(bytesToHex(retrieved!.cmu)).toBe(bytesToHex(cmu));
    });

    test('returns null for unknown commitment', () => {
      const unknownCmu = new Uint8Array(32).fill(255);

      expect(cache.getNoteByCommitment(unknownCmu)).toBeNull();
    });
  });

  describe('getNotesForAddress', () => {
    test('returns notes for address', () => {
      const address = 'zs1myaddress';
      const note1 = createMockNote({ 
        address,
        cmu: new Uint8Array(32).fill(1)
      });
      const note2 = createMockNote({ 
        address,
        cmu: new Uint8Array(32).fill(2)
      });
      
      cache.addNote({
        note: note1,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.addNote({
        note: note2,
        blockHeight: 1001,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });

      const notes = cache.getNotesForAddress(address);

      expect(notes.length).toBe(2);
    });

    test('returns empty array for unknown address', () => {
      const notes = cache.getNotesForAddress('unknown');
      expect(notes).toEqual([]);
    });
  });

  describe('markSpent', () => {
    test('marks nullifier as spent', () => {
      const nullifier = new Uint8Array(32).fill(123);

      cache.markSpent(nullifier);

      expect(cache.isSpent(nullifier)).toBe(true);
    });

    test('updates note spent status', () => {
      const nullifier = new Uint8Array(32).fill(123);
      const note = createMockNote({ nullifier });
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });

      cache.markSpent(nullifier);

      const retrieved = cache.getNoteByNullifier(nullifier);
      expect(retrieved?.spent).toBe(true);
    });
  });

  describe('getSpendableNotes', () => {
    test('excludes spent notes', () => {
      const address = 'zs1testaddr';
      const nullifier = new Uint8Array(32).fill(1);
      const note = createMockNote({ 
        address, 
        nullifier,
        witness: createMockWitness()
      });
      
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      
      // Update tree state for confirmation check
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      let spendable = cache.getSpendableNotes(address);
      expect(spendable.length).toBe(1);

      cache.markSpent(nullifier);

      spendable = cache.getSpendableNotes(address);
      expect(spendable.length).toBe(0);
    });

    test('excludes notes without witness', () => {
      const address = 'zs1testaddr';
      const note = createMockNote({ address });
      // Note has no witness
      
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      const spendable = cache.getSpendableNotes(address);
      expect(spendable.length).toBe(0);
    });
  });

  describe('getBalance', () => {
    test('calculates total and spendable balance', () => {
      const address = 'zs1testaddr';
      const note1 = createMockNote({ 
        address,
        value: 100000,
        cmu: new Uint8Array(32).fill(1),
        witness: createMockWitness()
      });
      const note2 = createMockNote({ 
        address,
        value: 200000,
        cmu: new Uint8Array(32).fill(2),
        witness: createMockWitness()
      });
      
      cache.addNote({
        note: note1,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.addNote({
        note: note2,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 1,
        isOutgoing: false
      });
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      const balance = cache.getBalance(address);

      expect(balance.total).toBe(300000);
      expect(balance.spendable).toBe(300000);
    });
  });

  describe('revertToHeight', () => {
    test('removes notes above height', () => {
      const address = 'zs1testaddr';
      const note1 = createMockNote({ 
        address,
        cmu: new Uint8Array(32).fill(1)
      });
      const note2 = createMockNote({ 
        address,
        cmu: new Uint8Array(32).fill(2)
      });
      
      cache.addNote({
        note: note1,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.addNote({
        note: note2,
        blockHeight: 1100,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });

      expect(cache.getNoteCount()).toBe(2);

      cache.revertToHeight(1050);

      expect(cache.getNoteCount()).toBe(1);
    });
  });

  describe('export/import', () => {
    test('roundtrips cache state', () => {
      const address = 'zs1testaddr';
      const note = createMockNote({ address });
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.updateSyncedHeight(address, 1000);

      const exported = cache.export();
      
      const newCache = new NoteCache();
      newCache.import(exported);

      expect(newCache.getNoteCount()).toBe(1);
      expect(newCache.getSyncedHeight(address)).toBe(1000);
    });
  });

  describe('clear', () => {
    test('removes all data', () => {
      const note = createMockNote();
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.markSpent(note.nullifier);

      cache.clear();

      expect(cache.getNoteCount()).toBe(0);
      expect(cache.getSpentCount()).toBe(0);
    });
  });
});

describe('NoteSelector', () => {
  let cache: NoteCache;
  let selector: NoteSelector;

  beforeEach(() => {
    cache = new NoteCache();
    selector = new NoteSelector(cache);
  });

  describe('selectNotes', () => {
    test('selects notes to cover target amount', () => {
      const address = 'zs1testaddr';
      
      // Add notes with witnesses
      for (let i = 0; i < 3; i++) {
        const note = createMockNote({
          address,
          value: 100000 * (i + 1),
          cmu: new Uint8Array(32).fill(i),
          nullifier: new Uint8Array(32).fill(i + 100),
          witness: createMockWitness()
        });
        cache.addNote({
          note,
          blockHeight: 1000,
          txIndex: 0,
          outputIndex: i,
          isOutgoing: false
        });
      }
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      const result = selector.selectNotes(address, 150000);

      expect(result).not.toBeNull();
      expect(result!.totalValue).toBeGreaterThanOrEqual(150000);
    });

    test('returns null for insufficient funds', () => {
      const address = 'zs1testaddr';
      const note = createMockNote({
        address,
        value: 100000,
        witness: createMockWitness()
      });
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      const result = selector.selectNotes(address, 500000);

      expect(result).toBeNull();
    });

    test('excludes specified notes', () => {
      const address = 'zs1testaddr';
      const note1Cmu = new Uint8Array(32).fill(1);
      const note2Cmu = new Uint8Array(32).fill(2);
      
      const note1 = createMockNote({
        address,
        value: 100000,
        cmu: note1Cmu,
        nullifier: new Uint8Array(32).fill(101),
        witness: createMockWitness()
      });
      const note2 = createMockNote({
        address,
        value: 200000,
        cmu: note2Cmu,
        nullifier: new Uint8Array(32).fill(102),
        witness: createMockWitness()
      });
      
      cache.addNote({
        note: note1,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      cache.addNote({
        note: note2,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 1,
        isOutgoing: false
      });
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      // Exclude the larger note
      const result = selector.selectNotes(address, 50000, [note2Cmu]);

      expect(result).not.toBeNull();
      expect(result!.notes.length).toBe(1);
      expect(result!.totalValue).toBe(100000);
    });
  });

  describe('selectExactNotes', () => {
    test('finds exact match when available', () => {
      const address = 'zs1testaddr';
      const note = createMockNote({
        address,
        value: 150000,
        witness: createMockWitness()
      });
      cache.addNote({
        note,
        blockHeight: 1000,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      
      cache.updateTreeState({
        root: new Uint8Array(32),
        size: 100,
        blockHeight: 1100
      });

      const result = selector.selectExactNotes(address, 150000);

      expect(result).not.toBeNull();
      expect(result!.totalValue).toBe(150000);
      expect(result!.notes.length).toBe(1);
    });
  });
});


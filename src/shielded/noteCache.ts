/**
 * Note Cache
 * Manages storage and retrieval of scanned Sapling notes
 */

import type { 
  SaplingNote, 
  ScannedNote, 
  MerkleWitness,
  CommitmentTreeState 
} from './types.js';
import { bytesToHex, hexToBytes } from '../utils/bytes';

/**
 * Cache entry for a note
 */
interface NoteCacheEntry {
  note: SaplingNote;
  blockHeight: number;
  txIndex: number;
  outputIndex: number;
  isOutgoing: boolean;
  addedAt: number;
}

/**
 * Note Cache for managing scanned notes
 */
export class NoteCache {
  /** Notes indexed by commitment (hex) */
  private notesByCommitment: Map<string, NoteCacheEntry> = new Map();
  
  /** Notes indexed by nullifier (hex) */
  private notesByNullifier: Map<string, NoteCacheEntry> = new Map();
  
  /** Notes indexed by address */
  private notesByAddress: Map<string, Set<string>> = new Map();
  
  /** Spent nullifiers */
  private spentNullifiers: Set<string> = new Set();
  
  /** Last synced block height per address */
  private syncedHeights: Map<string, number> = new Map();
  
  /** Commitment tree state */
  private treeState: CommitmentTreeState | null = null;

  /**
   * Add a scanned note to the cache
   */
  addNote(scannedNote: ScannedNote): void {
    const commitmentHex = bytesToHex(scannedNote.note.cmu);
    
    // Check if already exists
    if (this.notesByCommitment.has(commitmentHex)) {
      return;
    }

    const entry: NoteCacheEntry = {
      note: scannedNote.note,
      blockHeight: scannedNote.blockHeight,
      txIndex: scannedNote.txIndex,
      outputIndex: scannedNote.outputIndex,
      isOutgoing: scannedNote.isOutgoing,
      addedAt: Date.now()
    };

    // Store by commitment
    this.notesByCommitment.set(commitmentHex, entry);

    // Store by nullifier if available
    if (scannedNote.note.nullifier.length > 0) {
      const nullifierHex = bytesToHex(scannedNote.note.nullifier);
      this.notesByNullifier.set(nullifierHex, entry);
    }

    // Store by address
    const address = scannedNote.note.address;
    if (address) {
      if (!this.notesByAddress.has(address)) {
        this.notesByAddress.set(address, new Set());
      }
      this.notesByAddress.get(address)!.add(commitmentHex);
    }
  }

  /**
   * Add multiple notes
   */
  addNotes(notes: ScannedNote[]): void {
    for (const note of notes) {
      this.addNote(note);
    }
  }

  /**
   * Get note by commitment
   */
  getNoteByCommitment(commitment: Uint8Array): SaplingNote | null {
    const hex = bytesToHex(commitment);
    const entry = this.notesByCommitment.get(hex);
    return entry?.note || null;
  }

  /**
   * Get note by nullifier
   */
  getNoteByNullifier(nullifier: Uint8Array): SaplingNote | null {
    const hex = bytesToHex(nullifier);
    const entry = this.notesByNullifier.get(hex);
    return entry?.note || null;
  }

  /**
   * Get all notes for an address
   */
  getNotesForAddress(address: string): SaplingNote[] {
    const commitments = this.notesByAddress.get(address);
    if (!commitments) {
      return [];
    }

    const notes: SaplingNote[] = [];
    for (const commitmentHex of commitments) {
      const entry = this.notesByCommitment.get(commitmentHex);
      if (entry) {
        notes.push(entry.note);
      }
    }
    return notes;
  }

  /**
   * Get spendable notes for an address
   */
  getSpendableNotes(address: string, minConfirmations: number = 1): SaplingNote[] {
    const notes = this.getNotesForAddress(address);
    const currentHeight = this.treeState?.blockHeight || 0;
    
    return notes.filter(note => {
      // Check if spent
      if (note.spent) {
        return false;
      }

      // Check nullifier not in spent set
      const nullifierHex = bytesToHex(note.nullifier);
      if (this.spentNullifiers.has(nullifierHex)) {
        return false;
      }

      // Check confirmations
      const entry = this.notesByCommitment.get(bytesToHex(note.cmu));
      if (entry && entry.blockHeight > 0) {
        const confirmations = currentHeight - entry.blockHeight + 1;
        if (confirmations < minConfirmations) {
          return false;
        }
      }

      // Check has valid witness
      if (!note.witness) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get total balance for an address
   */
  getBalance(address: string): { total: number; spendable: number } {
    const allNotes = this.getNotesForAddress(address);
    const spendableNotes = this.getSpendableNotes(address);

    const total = allNotes
      .filter(n => !n.spent && !this.spentNullifiers.has(bytesToHex(n.nullifier)))
      .reduce((sum, note) => sum + note.value, 0);

    const spendable = spendableNotes.reduce((sum, note) => sum + note.value, 0);

    return { total, spendable };
  }

  /**
   * Mark a nullifier as spent
   */
  markSpent(nullifier: Uint8Array): void {
    const hex = bytesToHex(nullifier);
    this.spentNullifiers.add(hex);

    // Update the note if we have it
    const entry = this.notesByNullifier.get(hex);
    if (entry) {
      entry.note.spent = true;
    }
  }

  /**
   * Mark multiple nullifiers as spent
   */
  markSpentBatch(nullifiers: Uint8Array[]): void {
    for (const nullifier of nullifiers) {
      this.markSpent(nullifier);
    }
  }

  /**
   * Check if nullifier is spent
   */
  isSpent(nullifier: Uint8Array): boolean {
    const hex = bytesToHex(nullifier);
    return this.spentNullifiers.has(hex);
  }

  /**
   * Update witness for a note
   */
  updateWitness(commitment: Uint8Array, witness: MerkleWitness): void {
    const hex = bytesToHex(commitment);
    const entry = this.notesByCommitment.get(hex);
    if (entry) {
      entry.note.witness = witness;
    }
  }

  /**
   * Update tree state
   */
  updateTreeState(state: CommitmentTreeState): void {
    this.treeState = state;
  }

  /**
   * Get current tree state
   */
  getTreeState(): CommitmentTreeState | null {
    return this.treeState;
  }

  /**
   * Get synced height for address
   */
  getSyncedHeight(address: string): number {
    return this.syncedHeights.get(address) || 0;
  }

  /**
   * Update synced height for address
   */
  updateSyncedHeight(address: string, height: number): void {
    this.syncedHeights.set(address, height);
  }

  /**
   * Get all addresses with notes
   */
  getAddresses(): string[] {
    return Array.from(this.notesByAddress.keys());
  }

  /**
   * Get note count
   */
  getNoteCount(): number {
    return this.notesByCommitment.size;
  }

  /**
   * Get spent nullifier count
   */
  getSpentCount(): number {
    return this.spentNullifiers.size;
  }

  /**
   * Remove notes below a certain block height (for reorg handling)
   */
  revertToHeight(height: number): void {
    const toRemove: string[] = [];

    for (const [commitmentHex, entry] of this.notesByCommitment) {
      if (entry.blockHeight > height) {
        toRemove.push(commitmentHex);
      }
    }

    for (const commitmentHex of toRemove) {
      const entry = this.notesByCommitment.get(commitmentHex);
      if (entry) {
        // Remove from commitment map
        this.notesByCommitment.delete(commitmentHex);

        // Remove from nullifier map
        const nullifierHex = bytesToHex(entry.note.nullifier);
        this.notesByNullifier.delete(nullifierHex);

        // Remove from address map
        const addressNotes = this.notesByAddress.get(entry.note.address);
        if (addressNotes) {
          addressNotes.delete(commitmentHex);
          if (addressNotes.size === 0) {
            this.notesByAddress.delete(entry.note.address);
          }
        }
      }
    }

    // Update synced heights
    for (const [address, syncedHeight] of this.syncedHeights) {
      if (syncedHeight > height) {
        this.syncedHeights.set(address, height);
      }
    }

    // Update tree state
    if (this.treeState && this.treeState.blockHeight > height) {
      this.treeState = null;
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.notesByCommitment.clear();
    this.notesByNullifier.clear();
    this.notesByAddress.clear();
    this.spentNullifiers.clear();
    this.syncedHeights.clear();
    this.treeState = null;
  }

  /**
   * Export cache state for persistence
   */
  export(): CacheState {
    const notes: SerializedNote[] = [];
    for (const [commitmentHex, entry] of this.notesByCommitment) {
      notes.push({
        commitmentHex,
        note: serializeNote(entry.note),
        blockHeight: entry.blockHeight,
        txIndex: entry.txIndex,
        outputIndex: entry.outputIndex,
        isOutgoing: entry.isOutgoing
      });
    }

    return {
      notes,
      spentNullifiers: Array.from(this.spentNullifiers),
      syncedHeights: Object.fromEntries(this.syncedHeights),
      treeState: this.treeState ? {
        root: bytesToHex(this.treeState.root),
        size: this.treeState.size,
        blockHeight: this.treeState.blockHeight
      } : null
    };
  }

  /**
   * Import cache state from persistence
   */
  import(state: CacheState): void {
    this.clear();

    for (const serialized of state.notes) {
      const note = deserializeNote(serialized.note);
      this.addNote({
        note,
        blockHeight: serialized.blockHeight,
        txIndex: serialized.txIndex,
        outputIndex: serialized.outputIndex,
        isOutgoing: serialized.isOutgoing
      });
    }

    for (const nullifierHex of state.spentNullifiers) {
      this.spentNullifiers.add(nullifierHex);
    }

    for (const [address, height] of Object.entries(state.syncedHeights)) {
      this.syncedHeights.set(address, height);
    }

    if (state.treeState) {
      this.treeState = {
        root: hexToBytes(state.treeState.root),
        size: state.treeState.size,
        blockHeight: state.treeState.blockHeight
      };
    }
  }
}

/**
 * Serialized cache state for persistence
 */
interface CacheState {
  notes: SerializedNote[];
  spentNullifiers: string[];
  syncedHeights: Record<string, number>;
  treeState: {
    root: string;
    size: number;
    blockHeight: number;
  } | null;
}

/**
 * Serialized note for persistence
 */
interface SerializedNote {
  commitmentHex: string;
  note: SerializedNoteData;
  blockHeight: number;
  txIndex: number;
  outputIndex: number;
  isOutgoing: boolean;
}

/**
 * Serialized note data
 */
interface SerializedNoteData {
  commitment: string;
  nullifier: string;
  value: number;
  rcm: string;
  rseed: string;
  cmu: string;
  address: string;
  diversifier: string;
  pkD: string;
  position?: number;
  blockHeight?: number;
  memo?: string;
  spent: boolean;
}

/**
 * Serialize a note for storage
 */
function serializeNote(note: SaplingNote): SerializedNoteData {
  return {
    commitment: bytesToHex(note.commitment),
    nullifier: bytesToHex(note.nullifier),
    value: note.value,
    rcm: bytesToHex(note.rcm),
    rseed: bytesToHex(note.rseed),
    cmu: bytesToHex(note.cmu),
    address: note.address,
    diversifier: bytesToHex(note.diversifier),
    pkD: bytesToHex(note.pkD),
    position: note.position,
    blockHeight: note.blockHeight,
    memo: note.memo ? bytesToHex(note.memo) : undefined,
    spent: note.spent
  };
}

/**
 * Deserialize a note from storage
 */
function deserializeNote(data: SerializedNoteData): SaplingNote {
  return {
    commitment: hexToBytes(data.commitment),
    nullifier: hexToBytes(data.nullifier),
    value: data.value,
    rcm: hexToBytes(data.rcm),
    rseed: hexToBytes(data.rseed),
    cmu: hexToBytes(data.cmu),
    address: data.address,
    diversifier: hexToBytes(data.diversifier),
    pkD: hexToBytes(data.pkD),
    position: data.position,
    blockHeight: data.blockHeight,
    memo: data.memo ? hexToBytes(data.memo) : undefined,
    spent: data.spent
  };
}

/**
 * Note selection for spending
 */
export class NoteSelector {
  private cache: NoteCache;

  constructor(cache: NoteCache) {
    this.cache = cache;
  }

  /**
   * Select notes to spend for a given amount
   * Uses largest-first strategy for privacy (fewer notes = smaller transaction)
   */
  selectNotes(
    address: string,
    targetAmount: number,
    excludeNotes?: Uint8Array[]
  ): { notes: SaplingNote[]; totalValue: number } | null {
    const spendable = this.cache.getSpendableNotes(address);
    
    // Filter excluded notes
    const excluded = new Set(excludeNotes?.map(n => bytesToHex(n)) || []);
    const available = spendable.filter(
      note => !excluded.has(bytesToHex(note.cmu))
    );

    // Sort by value descending (largest first)
    available.sort((a, b) => b.value - a.value);

    const selected: SaplingNote[] = [];
    let totalValue = 0;

    for (const note of available) {
      selected.push(note);
      totalValue += note.value;

      if (totalValue >= targetAmount) {
        return { notes: selected, totalValue };
      }
    }

    // Insufficient funds
    return null;
  }

  /**
   * Select exact notes if possible (for better privacy)
   */
  selectExactNotes(
    address: string,
    targetAmount: number
  ): { notes: SaplingNote[]; totalValue: number } | null {
    const spendable = this.cache.getSpendableNotes(address);

    // Try to find a single note with exact value
    for (const note of spendable) {
      if (note.value === targetAmount) {
        return { notes: [note], totalValue: note.value };
      }
    }

    // Try to find a combination using subset sum (limited search)
    const result = this.subsetSum(spendable, targetAmount, 4);
    if (result) {
      return result;
    }

    // Fall back to regular selection
    return this.selectNotes(address, targetAmount);
  }

  /**
   * Limited subset sum search
   */
  private subsetSum(
    notes: SaplingNote[],
    target: number,
    maxNotes: number
  ): { notes: SaplingNote[]; totalValue: number } | null {
    // Sort by value
    const sorted = [...notes].sort((a, b) => b.value - a.value);
    
    // Try combinations up to maxNotes
    for (let size = 1; size <= Math.min(maxNotes, sorted.length); size++) {
      const result = this.findCombination(sorted, target, size, 0, [], 0);
      if (result) {
        return result;
      }
    }
    
    return null;
  }

  /**
   * Recursive combination finder
   */
  private findCombination(
    notes: SaplingNote[],
    target: number,
    size: number,
    start: number,
    current: SaplingNote[],
    currentSum: number
  ): { notes: SaplingNote[]; totalValue: number } | null {
    if (current.length === size) {
      if (currentSum === target) {
        return { notes: [...current], totalValue: currentSum };
      }
      return null;
    }

    for (let i = start; i < notes.length; i++) {
      const note = notes[i];
      if (currentSum + note.value > target) {
        continue; // Skip if would exceed target
      }

      current.push(note);
      const result = this.findCombination(
        notes,
        target,
        size,
        i + 1,
        current,
        currentSum + note.value
      );
      if (result) {
        return result;
      }
      current.pop();
    }

    return null;
  }
}


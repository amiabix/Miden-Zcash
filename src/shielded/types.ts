/**
 * Shielded Transaction Types
 * Core types for Zcash shielded (Sapling) transactions
 */

/**
 * Sapling note - represents a shielded value
 */
export interface SaplingNote {
  /** Note commitment (32 bytes) */
  commitment: Uint8Array;
  
  /** Note nullifier (32 bytes) - used to prevent double spending */
  nullifier: Uint8Array;
  
  /** Value in zatoshi */
  value: number;
  
  /** Randomness for note commitment (rcm) */
  rcm: Uint8Array;
  
  /** Random seed for note */
  rseed: Uint8Array;
  
  /** Note commitment (cmu) - hash of note contents */
  cmu: Uint8Array;
  
  /** Recipient address */
  address: string;
  
  /** Diversifier (11 bytes) */
  diversifier: Uint8Array;
  
  /** Transmission key (pk_d) */
  pkD: Uint8Array;
  
  /** Position in commitment tree */
  position?: number;
  
  /** Witness/authentication path in Merkle tree */
  witness?: MerkleWitness;
  
  /** Block height when note was created */
  blockHeight?: number;
  
  /** Optional memo (512 bytes max) */
  memo?: Uint8Array;
  
  /** Whether note has been spent */
  spent: boolean;
}

/**
 * Merkle witness for proving note inclusion
 */
export interface MerkleWitness {
  /** Authentication path (array of sibling hashes) */
  authPath: Uint8Array[];
  
  /** Position bits indicating left/right at each level */
  position: bigint;

  /** Anchor (merkle tree root) at time of witness creation */
  anchor?: Uint8Array;
}

/**
 * Sapling spending key components
 */
export interface SaplingSpendingKey {
  /** Ask - spend authorizing key */
  ask: Uint8Array;
  
  /** Nsk - nullifier private key */
  nsk: Uint8Array;
  
  /** Ovk - outgoing viewing key */
  ovk: Uint8Array;
}

/**
 * Sapling full viewing key
 */
export interface SaplingFullViewingKey {
  /** Ak - spend validating key (public) */
  ak: Uint8Array;
  
  /** Nk - nullifier deriving key */
  nk: Uint8Array;
  
  /** Ovk - outgoing viewing key */
  ovk: Uint8Array;
}

/**
 * Sapling incoming viewing key
 */
export interface SaplingIncomingViewingKey {
  /** Ivk - incoming viewing key scalar */
  ivk: Uint8Array;
}

/**
 * Sapling payment address
 */
export interface SaplingPaymentAddress {
  /** Diversifier (11 bytes) */
  diversifier: Uint8Array;
  
  /** Transmission key (pk_d) */
  pkD: Uint8Array;
}

/**
 * Shielded output description
 */
export interface ShieldedOutputDescription {
  /** Value commitment (cv) */
  cv: Uint8Array;
  
  /** Note commitment (cmu) */
  cmu: Uint8Array;
  
  /** Ephemeral public key for note encryption */
  ephemeralKey: Uint8Array;
  
  /** Encrypted note ciphertext (580 bytes for Sapling) */
  encCiphertext: Uint8Array;
  
  /** Encrypted memo/outgoing ciphertext (80 bytes) */
  outCiphertext: Uint8Array;
  
  /** zk-SNARK proof */
  zkproof: Uint8Array;
}

/**
 * Shielded spend description
 */
export interface ShieldedSpendDescription {
  /** Value commitment (cv) */
  cv: Uint8Array;
  
  /** Anchor - root of the Sapling commitment tree */
  anchor: Uint8Array;
  
  /** Nullifier */
  nullifier: Uint8Array;
  
  /** Randomized validating key (rk) */
  rk: Uint8Array;
  
  /** zk-SNARK proof */
  zkproof: Uint8Array;
  
  /** Spend authorization signature */
  spendAuthSig: Uint8Array;
}

/**
 * Shielded transaction components
 */
export interface ShieldedBundle {
  /** Shielded spends */
  spends: ShieldedSpendDescription[];
  
  /** Shielded outputs */
  outputs: ShieldedOutputDescription[];
  
  /** Value balance (net value flowing into/out of shielded pool) */
  valueBalance: bigint;
  
  /** Binding signature */
  bindingSig: Uint8Array;
}

/**
 * Parameters for building a shielded output
 */
export interface ShieldedOutputParams {
  /** Recipient address */
  address: string;
  
  /** Value in zatoshi */
  value: number;
  
  /** Optional memo (up to 512 bytes) */
  memo?: string | Uint8Array;
  
  /** Outgoing viewing key (for sender to decrypt later) */
  ovk?: Uint8Array;
}

/**
 * Parameters for spending a note
 */
export interface NoteSpendParams {
  /** Note to spend */
  note: SaplingNote;
  
  /** Spending key */
  spendingKey: SaplingSpendingKey;
  
  /** Merkle witness for note */
  witness: MerkleWitness;
  
  /** Current anchor (commitment tree root) */
  anchor: Uint8Array;
}

/**
 * Proof inputs for Sapling spend circuit
 */
export interface SpendProofInputs {
  /** Value commitment randomness (rcv) */
  rcv: Uint8Array;
  
  /** Spend authorizing randomness (alpha) */
  alpha: Uint8Array;
  
  /** Note value */
  value: bigint;
  
  /** Note randomness (rcm) */
  rcm: Uint8Array;
  
  /** Spending key ask */
  ask: Uint8Array;
  
  /** Nullifier key nsk */
  nsk: Uint8Array;
  
  /** Anchor */
  anchor: Uint8Array;
  
  /** Merkle path */
  merklePath: Uint8Array[];
  
  /** Position in tree */
  position: bigint;
}

/**
 * Proof inputs for Sapling output circuit
 */
export interface OutputProofInputs {
  /** Value commitment randomness (rcv) */
  rcv: Uint8Array;
  
  /** Note value */
  value: bigint;
  
  /** Note randomness (rcm) */
  rcm: Uint8Array;
  
  /** Recipient diversifier */
  diversifier: Uint8Array;
  
  /** Recipient pk_d */
  pkD: Uint8Array;
  
  /** Ephemeral secret key (esk) */
  esk: Uint8Array;
}

/**
 * Sapling proof result
 */
export interface SaplingProof {
  /** Groth16 proof (192 bytes) */
  proof: Uint8Array;
  
  /** Value commitment */
  cv: Uint8Array;
  
  /** Randomized key (for spends) or cmu (for outputs) */
  rk?: Uint8Array;
  cmu?: Uint8Array;
}

/**
 * Note plaintext (decrypted note contents)
 */
export interface NotePlaintext {
  /** Lead byte (version) */
  leadByte: number;
  
  /** Diversifier */
  diversifier: Uint8Array;
  
  /** Value */
  value: bigint;
  
  /** Rseed */
  rseed: Uint8Array;
  
  /** Memo */
  memo: Uint8Array;
}

/**
 * Compact note representation for light client sync
 */
export interface CompactNote {
  /** Note commitment (cmu) - leaf in merkle tree */
  cmu: Uint8Array;
  
  /** Ephemeral key for key agreement */
  ephemeralKey: Uint8Array;
  
  /** First 52 bytes of encrypted ciphertext (compact format) */
  ciphertext: Uint8Array;

  /** Full encrypted ciphertext (580 bytes for Sapling) - optional for compact format */
  encCiphertext?: Uint8Array;

  /** Outgoing ciphertext (80 bytes) - for outgoing viewing key decryption */
  outCiphertext?: Uint8Array;

  /** Value commitment (cv) - Pedersen commitment to value */
  cv?: Uint8Array;
}

/**
 * Scanned note result
 */
export interface ScannedNote {
  /** Decrypted note */
  note: SaplingNote;
  
  /** Block height */
  blockHeight: number;
  
  /** Transaction index in block */
  txIndex: number;
  
  /** Output index in transaction */
  outputIndex: number;
  
  /** Whether this is an outgoing note (sent by us) */
  isOutgoing: boolean;
}

/**
 * Note scanning progress
 */
export interface ScanProgress {
  /** Start block */
  startHeight: number;
  
  /** End block (target) */
  endHeight: number;
  
  /** Current block being scanned */
  currentHeight: number;
  
  /** Notes found so far */
  notesFound: number;
  
  /** Percentage complete */
  percentComplete: number;
}

/**
 * Commitment tree state
 */
export interface CommitmentTreeState {
  /** Tree root (anchor) */
  root: Uint8Array;
  
  /** Tree size (number of notes) */
  size: number;
  
  /** Block height of this state */
  blockHeight: number;
}


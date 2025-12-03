/**
 * Zcash Key Derivation
 * Derives Zcash keys from Miden account keys using HKDF and BIP32
 * 
 * Key Derivation Hierarchy:
 * 
 * Miden Account Private Key
 *     ↓ HKDF-SHA256
 * Master Seed (64 bytes)
 *     ↓ BIP32
 * m/44'/133'/account'/change/index
 *     ↓
 * ├─→ Transparent Private Key (secp256k1)
 * │       ↓
 * │   Transparent Address (t1...)
 * │
 * └─→ Spending Key (Ed25519 derived)
 *         ↓
 *     ├─→ Viewing Key
 *     │       ↓
 *     │   Shielded Address (zs1...)
 *     │
 *     └─→ Nullifier Key
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { ZcashKeys, Network } from '../types/index';
import {
  concatBytes,
  numberToLEBytes
} from '../utils/bytes';
import { base58Encode, bech32Encode, base58Decode, bech32Decode } from '../utils/encoding';
import { hash160, doubleSha256 } from '../utils/hash';

/**
 * Zcash BIP44 coin type
 */
const ZCASH_COIN_TYPE = 133;

/**
 * Network version bytes for addresses
 */
interface NetworkVersion {
  pubKeyHash: Uint8Array;
  scriptHash: Uint8Array;
  saplingHRP: string;
  saplingPaymentAddressHRP: string;
}

const NETWORK_VERSIONS: Record<Network, NetworkVersion> = {
  mainnet: {
    pubKeyHash: new Uint8Array([0x1c, 0xb8]), // t1...
    scriptHash: new Uint8Array([0x1c, 0xbd]), // t3...
    saplingHRP: 'zs',
    saplingPaymentAddressHRP: 'zs'
  },
  testnet: {
    pubKeyHash: new Uint8Array([0x1d, 0x25]), // tm...
    scriptHash: new Uint8Array([0x1c, 0xba]), // t2...
    saplingHRP: 'ztestsapling',
    saplingPaymentAddressHRP: 'ztestsapling'
  }
};

/**
 * BIP32 serialization constants
 */
const HARDENED_OFFSET = 0x80000000;

/**
 * Key derivation result with full key material
 */
/**
 * Key derivation result with full key material
 */
export interface DerivedKeyMaterial {
  masterSeed: Uint8Array;
  accountKey: Uint8Array;
  accountChainCode: Uint8Array;
  transparentPrivateKey: Uint8Array;
  transparentPublicKey: Uint8Array;
  spendingKey: Uint8Array;
  viewingKey: Uint8Array;
  nullifierKey: Uint8Array;
  tAddress: string;
  zAddress: string;
}

/**
 * ZcashKeyDerivation
 * 
 * Handles all key derivation operations for Zcash from Miden account keys.
 * Implements BIP32/BIP44 for transparent addresses and custom derivation
 * for shielded addresses (Sapling).
 */
export class ZcashKeyDerivation {
  private readonly networkVersions: NetworkVersion;
  private readonly network: Network;

  constructor(network: Network = 'testnet') {
    this.network = network;
    this.networkVersions = NETWORK_VERSIONS[network];
  }

  /**
   * Derive all Zcash keys from Miden account
   * 
   * @param midenAccountId - Unique identifier for the Miden account
   * @param midenPrivateKey - Miden account's private key material
   * @param accountIndex - BIP44 account index (default: 0)
   * @returns Complete set of Zcash keys and addresses
   */
  deriveKeys(
    midenAccountId: string,
    midenPrivateKey: Uint8Array,
    accountIndex: number = 0
  ): ZcashKeys {
    // Validate inputs
    if (!midenAccountId || midenAccountId.length === 0) {
      throw new Error('Invalid Miden account ID');
    }
    if (!midenPrivateKey || midenPrivateKey.length < 32) {
      throw new Error('Invalid Miden private key');
    }
    if (accountIndex < 0 || accountIndex >= HARDENED_OFFSET) {
      throw new Error('Invalid account index');
    }

    // Step 1: Derive master seed from Miden key using HKDF
    const masterSeed = this.deriveMasterSeed(midenAccountId, midenPrivateKey, this.network);

    // Step 2: Derive BIP32 master key
    const masterKey = this.deriveBIP32MasterKey(masterSeed);

    // Step 3: Derive account-level key following BIP44 path
    // m/44'/133'/account'
    const purposeKey = this.deriveBIP32Child(masterKey, 44 + HARDENED_OFFSET);
    const coinTypeKey = this.deriveBIP32Child(purposeKey, ZCASH_COIN_TYPE + HARDENED_OFFSET);
    const accountKey = this.deriveBIP32Child(coinTypeKey, accountIndex + HARDENED_OFFSET);

    // Step 4: Derive transparent key (m/44'/133'/account'/0/0)
    const changeKey = this.deriveBIP32Child(accountKey, 0);
    const addressKey = this.deriveBIP32Child(changeKey, 0);
    const transparentPrivateKey = addressKey.privateKey;
    const transparentPublicKey = secp256k1.getPublicKey(transparentPrivateKey);
    const tAddress = this.generateTransparentAddress(transparentPublicKey);

    // Step 5: Derive shielded spending key
    const spendingKey = this.deriveSpendingKey(accountKey.privateKey, 0);
    const viewingKey = this.deriveViewingKey(spendingKey);
    const zAddress = this.generateShieldedAddress(viewingKey);

    return {
      spendingKey,
      viewingKey,
      transparentPrivateKey,
      tAddress,
      zAddress
    };
  }

  /**
   * Derive master seed from Miden account key using HKDF-SHA256
   * 
   * This provides domain separation between Miden and Zcash key spaces
   * and ensures deterministic derivation.
   */
  private deriveMasterSeed(
    midenAccountId: string,
    midenPrivateKey: Uint8Array,
    network: Network
  ): Uint8Array {
    // Include network in salt for domain separation (prevents testnet/mainnet collision)
    const salt = new TextEncoder().encode(`zcash-miden-${network}-${midenAccountId}`);
    
    // Use fixed info for reproducibility
    const info = new TextEncoder().encode('zcash-master-seed-v1');

    // Derive 64 bytes (standard BIP32 seed length)
    // Use SHA512 for BIP32 compliance
    return hkdf(sha512, midenPrivateKey, salt, info, 64);
  }

  /**
   * Derive BIP32 master key from seed
   * 
   * Follows BIP32 specification for master key derivation:
   * I = HMAC-SHA512(Key = "Bitcoin seed", Data = S)
   */
  private deriveBIP32MasterKey(seed: Uint8Array): BIP32Key {
    const key = new TextEncoder().encode('Bitcoin seed');
    // BIP32 specifies HMAC-SHA512
    const I = hmac(sha512, key, seed);
    
    // Split the 64-byte HMAC-SHA512 output
    // Left 32 bytes: private key
    const privateKey = I.slice(0, 32);
    // Right 32 bytes: chain code (per BIP32 spec)
    const chainCode = I.slice(32, 64);

    return {
      privateKey,
      chainCode,
      depth: 0,
      parentFingerprint: new Uint8Array(4),
      childIndex: 0
    };
  }

  /**
   * Derive child key using BIP32 algorithm
   * 
   * For hardened derivation (index >= 0x80000000):
   * I = HMAC-SHA512(Key = cpar, Data = 0x00 || kpar || ser32(i))
   * 
   * For normal derivation:
   * I = HMAC-SHA512(Key = cpar, Data = point(kpar) || ser32(i))
   */
  private deriveBIP32Child(parent: BIP32Key, index: number): BIP32Key {
    const isHardened = index >= HARDENED_OFFSET;
    
    let data: Uint8Array;
    if (isHardened) {
      // Hardened derivation: 0x00 || private key || index
      data = concatBytes(
        new Uint8Array([0]),
        parent.privateKey,
        numberToLEBytes(index, 4).reverse() // Big-endian for BIP32
      );
    } else {
      // Normal derivation: public key || index
      const publicKey = secp256k1.getPublicKey(parent.privateKey);
      data = concatBytes(
        publicKey,
        numberToLEBytes(index, 4).reverse() // Big-endian for BIP32
      );
    }

    // BIP32 mandates HMAC-SHA512 for child derivation
    const I = hmac(sha512, parent.chainCode, data);
    
    // Split the 64-byte HMAC-SHA512 output
    // Left 32 bytes (IL): add to parent private key
    const IL = I.slice(0, 32);
    const childPrivateKey = this.addPrivateKeys(parent.privateKey, IL);
    
    // Right 32 bytes (IR): new chain code (per BIP32 spec)
    const childChainCode = I.slice(32, 64);

    // Calculate parent fingerprint
    const parentPublicKey = secp256k1.getPublicKey(parent.privateKey);
    const parentId = hash160(parentPublicKey);
    const parentFingerprint = parentId.slice(0, 4);

    return {
      privateKey: childPrivateKey,
      chainCode: childChainCode,
      depth: parent.depth + 1,
      parentFingerprint,
      childIndex: index
    };
  }

  /**
   * Add two private keys modulo curve order
   */
  private addPrivateKeys(key1: Uint8Array, key2: Uint8Array): Uint8Array {
    // Convert to bigint
    let n1 = 0n;
    let n2 = 0n;
    for (let i = 0; i < 32; i++) {
      n1 = (n1 << 8n) | BigInt(key1[i]);
      n2 = (n2 << 8n) | BigInt(key2[i]);
    }

    // secp256k1 curve order
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

    // Add and reduce modulo curve order
    const sum = (n1 + n2) % N;

    // Validate result is not zero (invalid key)
    if (sum === 0n) {
      throw new Error('Invalid derived key: sum equals zero (mod curve order)');
    }

    // Validate result is less than curve order
    if (sum >= N) {
      throw new Error('Invalid derived key: sum >= curve order');
    }

    // Convert back to bytes
    const result = new Uint8Array(32);
    let temp = sum;
    for (let i = 31; i >= 0; i--) {
      result[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }

    // Validate conversion completed correctly
    if (temp !== 0n) {
      throw new Error('Key derivation overflow: result does not fit in 32 bytes');
    }

    return result;
  }

  /**
   * Derive Sapling spending key
   * 
   * Uses HKDF to derive a 32-byte spending key from the account key.
   * The spending key is used to:
   * - Generate nullifiers for spent notes
   * - Create spend authorization signatures
   */
  private deriveSpendingKey(
    accountKey: Uint8Array,
    diversifierIndex: number
  ): Uint8Array {
    const salt = new TextEncoder().encode('zcash-sapling-spending');
    const info = concatBytes(
      new TextEncoder().encode('spending-key-'),
      numberToLEBytes(diversifierIndex, 4)
    );

    return hkdf(sha256, accountKey, salt, info, 32);
  }

  /**
   * Derive viewing key from spending key
   * 
   * The viewing key allows viewing incoming transactions without
   * the ability to spend. It consists of:
   * - ak (authorizing key)
   * - nk (nullifier deriving key)
   * - ovk (outgoing viewing key)
   * - ivk (incoming viewing key)
   */
  private deriveViewingKey(spendingKey: Uint8Array): Uint8Array {
    const salt = new TextEncoder().encode('zcash-sapling-viewing');
    const info = new TextEncoder().encode('viewing-key-v1');

    return hkdf(sha256, spendingKey, salt, info, 32);
  }

  /**
   * Generate transparent (t-address) from public key
   * 
   * Process:
   * 1. SHA256 hash of public key
   * 2. RIPEMD160 of the SHA256 hash (HASH160)
   * 3. Prepend network version bytes
   * 4. Append 4-byte checksum (first 4 bytes of double SHA256)
   * 5. Base58 encode
   */
  generateTransparentAddress(publicKey: Uint8Array): string {
    // Step 1-2: HASH160
    const pubKeyHash = hash160(publicKey);

    // Step 3: Prepend version bytes
    const versionBytes = this.networkVersions.pubKeyHash;
    const versioned = concatBytes(versionBytes, pubKeyHash);

    // Step 4: Calculate checksum using double SHA-256
    const checksum = doubleSha256(versioned).slice(0, 4);

    // Step 5: Combine version, hash, and checksum, then Base58 encode
    const addressBytes = concatBytes(versioned, checksum);
    const address = base58Encode(addressBytes);
    
    return address;
  }

  /**
   * Generate shielded (z-address) from viewing key
   * 
   * For Sapling addresses, the format is:
   * - HRP (human readable part): "zs" for mainnet, "ztestsapling" for testnet
   * - Data: diversifier (11 bytes) + pkd (32 bytes)
   * - Bech32 encoded
   */
  generateShieldedAddress(viewingKey: Uint8Array): string {
    // Generate diversifier (11 bytes)
    // In production, this would use the proper diversifier derivation
    const diversifier = this.deriveDiversifier(viewingKey, 0);

    // Derive payment key (pkd)
    const pkd = this.derivePaymentKey(viewingKey, diversifier);

    // Combine diversifier and pkd
    const addressData = concatBytes(diversifier, pkd);

    // Bech32 encode
    return bech32Encode(this.networkVersions.saplingHRP, addressData);
  }

  /**
   * Derive diversifier from viewing key
   * 
   * The diversifier is used to generate multiple payment addresses
   * from the same viewing key, enhancing privacy.
   */
  private deriveDiversifier(viewingKey: Uint8Array, index: number): Uint8Array {
    const input = concatBytes(
      new TextEncoder().encode('diversifier'),
      viewingKey,
      numberToLEBytes(index, 4)
    );

    // Use first 11 bytes of hash as diversifier
    return sha256(input).slice(0, 11);
  }

  /**
   * Derive payment key from viewing key and diversifier
   */
  private derivePaymentKey(
    viewingKey: Uint8Array,
    diversifier: Uint8Array
  ): Uint8Array {
    const input = concatBytes(
      new TextEncoder().encode('payment-key'),
      viewingKey,
      diversifier
    );

    return sha256(input);
  }

  /**
   * Validate a transparent address
   */
  validateTransparentAddress(address: string): boolean {
    try {
      // Decode Base58
      const decoded = base58Decode(address);

      // Check minimum length (2 version + 20 hash + 4 checksum)
      if (decoded.length !== 26) {
        return false;
      }

      // Verify version bytes
      const version = decoded.slice(0, 2);
      const validMainnet = version[0] === 0x1c && version[1] === 0xb8;
      const validTestnet = version[0] === 0x1d && version[1] === 0x25;

      if (!validMainnet && !validTestnet) {
        return false;
      }

      // Verify checksum
      const payload = decoded.slice(0, -4);
      const checksum = decoded.slice(-4);
      const computed = doubleSha256(payload).slice(0, 4);

      for (let i = 0; i < 4; i++) {
        if (checksum[i] !== computed[i]) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate a shielded address
   */
  validateShieldedAddress(address: string): boolean {
    try {
      const { hrp, data } = bech32Decode(address);

      // Check HRP
      if (hrp !== 'zs' && hrp !== 'ztestsapling') {
        return false;
      }

      // Check data length (11 diversifier + 32 pkd = 43 bytes)
      if (data.length !== 43) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network for an address
   */
  getAddressNetwork(address: string): Network | null {
    if (address.startsWith('t1') || address.startsWith('t3')) {
      return 'mainnet';
    }
    if (address.startsWith('tm') || address.startsWith('t2')) {
      return 'testnet';
    }
    if (address.startsWith('zs1')) {
      return 'mainnet';
    }
    if (address.startsWith('ztestsapling')) {
      return 'testnet';
    }
    return null;
  }
}

/**
 * BIP32 key structure
 */
interface BIP32Key {
  privateKey: Uint8Array;
  chainCode: Uint8Array;
  depth: number;
  parentFingerprint: Uint8Array;
  childIndex: number;
}

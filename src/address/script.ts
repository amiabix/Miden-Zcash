/**
 * Script Generation
 * Generates Bitcoin/Zcash script pubkeys for transaction outputs
 */

import { bytesToHex, concatBytes } from '../utils/bytes';
import { hash160 } from '../utils/hash';
import { validateTransparentAddress, extractPubKeyHash } from './validation';

/**
 * Script opcodes
 */
export const OP = {
  // Push operations
  OP_0: 0x00,
  OP_FALSE: 0x00,
  OP_PUSHDATA1: 0x4c,
  OP_PUSHDATA2: 0x4d,
  OP_PUSHDATA4: 0x4e,
  OP_1NEGATE: 0x4f,
  OP_RESERVED: 0x50,
  OP_1: 0x51,
  OP_TRUE: 0x51,
  OP_2: 0x52,
  OP_3: 0x53,
  OP_16: 0x60,

  // Flow control
  OP_NOP: 0x61,
  OP_VER: 0x62,
  OP_IF: 0x63,
  OP_NOTIF: 0x64,
  OP_VERIF: 0x65,
  OP_VERNOTIF: 0x66,
  OP_ELSE: 0x67,
  OP_ENDIF: 0x68,
  OP_VERIFY: 0x69,
  OP_RETURN: 0x6a,

  // Stack operations
  OP_TOALTSTACK: 0x6b,
  OP_FROMALTSTACK: 0x6c,
  OP_2DROP: 0x6d,
  OP_2DUP: 0x6e,
  OP_3DUP: 0x6f,
  OP_2OVER: 0x70,
  OP_2ROT: 0x71,
  OP_2SWAP: 0x72,
  OP_IFDUP: 0x73,
  OP_DEPTH: 0x74,
  OP_DROP: 0x75,
  OP_DUP: 0x76,
  OP_NIP: 0x77,
  OP_OVER: 0x78,
  OP_PICK: 0x79,
  OP_ROLL: 0x7a,
  OP_ROT: 0x7b,
  OP_SWAP: 0x7c,
  OP_TUCK: 0x7d,

  // Crypto
  OP_RIPEMD160: 0xa6,
  OP_SHA1: 0xa7,
  OP_SHA256: 0xa8,
  OP_HASH160: 0xa9,
  OP_HASH256: 0xaa,
  OP_CODESEPARATOR: 0xab,
  OP_CHECKSIG: 0xac,
  OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,

  // Comparison
  OP_EQUAL: 0x87,
  OP_EQUALVERIFY: 0x88
} as const;

/**
 * Script types
 */
export type ScriptType = 'p2pkh' | 'p2sh' | 'p2pk' | 'nulldata' | 'unknown';

/**
 * Decoded script information
 */
export interface DecodedScript {
  type: ScriptType;
  hex: string;
  asm: string;
  addresses?: string[];
  requiredSigs?: number;
}

/**
 * Generate P2PKH (Pay-to-Public-Key-Hash) scriptPubKey
 * 
 * Format: OP_DUP OP_HASH160 <20-byte pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
 */
export function createP2PKHScript(pubKeyHash: Uint8Array): Uint8Array {
  if (pubKeyHash.length !== 20) {
    throw new Error('Public key hash must be 20 bytes');
  }

  return new Uint8Array([
    OP.OP_DUP,           // 0x76
    OP.OP_HASH160,       // 0xa9
    0x14,                // Push 20 bytes
    ...pubKeyHash,
    OP.OP_EQUALVERIFY,   // 0x88
    OP.OP_CHECKSIG       // 0xac
  ]);
}

/**
 * Generate P2PKH scriptPubKey from public key
 */
export function createP2PKHScriptFromPubKey(publicKey: Uint8Array): Uint8Array {
  const pubKeyHash = hash160(publicKey);
  return createP2PKHScript(pubKeyHash);
}

/**
 * Generate P2PKH scriptPubKey from address
 */
export function createP2PKHScriptFromAddress(address: string): Uint8Array {
  const result = validateTransparentAddress(address);
  if (!result.valid) {
    throw new Error(`Invalid address: ${result.error}`);
  }

  const pubKeyHash = extractPubKeyHash(address);
  if (!pubKeyHash) {
    throw new Error('Failed to extract public key hash from address');
  }

  return createP2PKHScript(pubKeyHash);
}

/**
 * Generate P2SH (Pay-to-Script-Hash) scriptPubKey
 * 
 * Format: OP_HASH160 <20-byte scriptHash> OP_EQUAL
 */
export function createP2SHScript(scriptHash: Uint8Array): Uint8Array {
  if (scriptHash.length !== 20) {
    throw new Error('Script hash must be 20 bytes');
  }

  return new Uint8Array([
    OP.OP_HASH160,  // 0xa9
    0x14,           // Push 20 bytes
    ...scriptHash,
    OP.OP_EQUAL     // 0x87
  ]);
}

/**
 * Generate P2SH scriptPubKey from redeem script
 */
export function createP2SHScriptFromRedeemScript(redeemScript: Uint8Array): Uint8Array {
  const scriptHash = hash160(redeemScript);
  return createP2SHScript(scriptHash);
}

/**
 * Generate P2PK (Pay-to-Public-Key) scriptPubKey
 * 
 * Format: <pubkey> OP_CHECKSIG
 */
export function createP2PKScript(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 33 && publicKey.length !== 65) {
    throw new Error('Invalid public key length');
  }

  const result = new Uint8Array(1 + publicKey.length + 1);
  result[0] = publicKey.length; // Push length
  result.set(publicKey, 1);
  result[result.length - 1] = OP.OP_CHECKSIG;

  return result;
}

/**
 * Generate OP_RETURN script (null data)
 * 
 * Format: OP_RETURN <data>
 */
export function createOpReturnScript(data: Uint8Array): Uint8Array {
  if (data.length > 80) {
    throw new Error('OP_RETURN data cannot exceed 80 bytes');
  }

  if (data.length <= 75) {
    return new Uint8Array([
      OP.OP_RETURN,
      data.length,
      ...data
    ]);
  } else {
    return new Uint8Array([
      OP.OP_RETURN,
      OP.OP_PUSHDATA1,
      data.length,
      ...data
    ]);
  }
}

/**
 * Create scriptSig for P2PKH spending
 * 
 * Format: <signature> <publicKey>
 */
export function createP2PKHScriptSig(
  signature: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  // Signature with SIGHASH_ALL
  const sigWithHashType = concatBytes(signature, new Uint8Array([0x01]));

  return concatBytes(
    new Uint8Array([sigWithHashType.length]),
    sigWithHashType,
    new Uint8Array([publicKey.length]),
    publicKey
  );
}

/**
 * Decode script to human-readable form
 */
export function decodeScript(script: Uint8Array): DecodedScript {
  const hex = bytesToHex(script);
  let type: ScriptType = 'unknown';
  let asm = '';

  // Check for P2PKH
  if (script.length === 25 &&
      script[0] === OP.OP_DUP &&
      script[1] === OP.OP_HASH160 &&
      script[2] === 0x14 &&
      script[23] === OP.OP_EQUALVERIFY &&
      script[24] === OP.OP_CHECKSIG) {
    type = 'p2pkh';
    const pubKeyHash = bytesToHex(script.slice(3, 23));
    asm = `OP_DUP OP_HASH160 ${pubKeyHash} OP_EQUALVERIFY OP_CHECKSIG`;
  }
  // Check for P2SH
  else if (script.length === 23 &&
           script[0] === OP.OP_HASH160 &&
           script[1] === 0x14 &&
           script[22] === OP.OP_EQUAL) {
    type = 'p2sh';
    const scriptHash = bytesToHex(script.slice(2, 22));
    asm = `OP_HASH160 ${scriptHash} OP_EQUAL`;
  }
  // Check for OP_RETURN
  else if (script.length >= 1 && script[0] === OP.OP_RETURN) {
    type = 'nulldata';
    if (script.length > 1) {
      const dataLen = script[1];
      const data = bytesToHex(script.slice(2, 2 + dataLen));
      asm = `OP_RETURN ${data}`;
    } else {
      asm = 'OP_RETURN';
    }
  }
  // Check for P2PK
  else if ((script.length === 35 || script.length === 67) &&
           script[script.length - 1] === OP.OP_CHECKSIG) {
    type = 'p2pk';
    const pubKey = bytesToHex(script.slice(1, -1));
    asm = `${pubKey} OP_CHECKSIG`;
  }

  return {
    type,
    hex,
    asm
  };
}

/**
 * Identify script type
 */
export function identifyScriptType(script: Uint8Array): ScriptType {
  return decodeScript(script).type;
}

/**
 * Validate scriptPubKey format
 */
export function isValidScriptPubKey(script: Uint8Array): boolean {
  const type = identifyScriptType(script);
  return type !== 'unknown';
}

/**
 * Get required signatures for script
 */
export function getRequiredSignatures(script: Uint8Array): number {
  const type = identifyScriptType(script);

  switch (type) {
    case 'p2pkh':
    case 'p2pk':
      return 1;
    case 'p2sh':
      // Would need to decode redeem script for actual count
      return 1;
    case 'nulldata':
      return 0;
    default:
      return 1;
  }
}


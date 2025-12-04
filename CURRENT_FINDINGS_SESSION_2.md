# Session 2 Findings: Critical Jubjub Curve Implementation Issues

## Summary
Continuation of comprehensive audit from Session 1. This session focused on fixing the hash-to-curve algorithm (`diversifyHash` and `jubjubFindGroupHash`) to enable proper cryptographic operations.

## Critical Discovery
**The hardcoded generator point in the codebase is INVALID for both attempted Jubjub variants.**

### Evidence
- Generator point: `Gu = 8967009...`, `Gv = 159318008...`
- Tested with `a = -1` (official Zcash): **Not on curve**
- Tested with `a = 1`: **Not on curve**
- Computed the correct d value for this generator point with `a = 1`: `51688708...`
  - This does NOT match the expected d value for either variant
  - This means the point is invalid for BOTH curves

## Root Cause Analysis

### Previous Session Issues (Session 1)
1. ✅ FIXED: Invalid generator derivation (hard-coded identical coordinates)
2. ✅ FIXED: Development mode accepting invalid proofs
3. ✅ FIXED: Field element subtraction not handling negatives
4. ❌ UNRESOLVED: Point addition associativity (turned out to be hash-to-curve issue)
5. ✅ FIXED: Square root algorithm incomplete
6. ✅ FIXED: RecoverX sign handling
7. ✅ FIXED: Missing curve validation
8. ⚠️ ONGOING: Hash-to-curve failing to find valid points (ROOT CAUSE: invalid generator)

### This Session's Discoveries

#### Issue A: Curve Parameter Mismatch
Original codebase had:
- `a = 1` (inconsistent with documented equation `-x² + y²`)
- `d = -10540/10741` (different from Zcash spec `-10240/10241`)

This created a hybrid curve that was never fully specified or validated.

#### Issue B: RecoverX Formula Was Incompletely Fixed
- Original: Used `1 - d*y²` (wrong for `-x² + y² = 1 + d*x²*y²`)
- Session 1: Changed to `1 + d*y²` (correct for `-x² + y²`)
- Session 2 Discovery: Need `d*y² - 1` for `a = 1` variant

#### Issue C: Hash-to-Curve Complete Failure
`diversifyHash` and `jubjubFindGroupHash` cannot find valid points because:
- `recoverX` formula was wrong, producing all non-quadratic-residues
- When fixed, realized the generator point itself is invalid
- Valid generator point is a prerequisite for proper curve operations

## Current Implementation Status

### Curve Parameters (Current)
```typescript
const JUBJUB = {
  p: 52435875175126190479447740508185965837690552500527637822603658699938581184513n,
  order: 6554484396890773809930967563523245960744023425112482949290220310578048130569n,
  a: 1n,
  d: 19257038036680949359750312669786877991949435402254120286184196891950884077233n,
};
```

### Problem: Generator Validation
```
Generator Point: (Gu, Gv) from original code
Curve Equation: a*x² + y² = 1 + d*x²*y² (with a=1, d above)
Result: POINT NOT ON CURVE ❌
```

## Path Forward

To resolve this crisis, one of two approaches:

### Option A: Use Official Zcash Jubjub
1. Adopt official Zcash parameters (proven to work)
2. Derive generators using official group hash
3. Test against official test vectors
4. Estimated effort: 4-6 hours

**Benefits:**
- Cryptographically sound
- Interoperable with Zcash
- Well-tested and audited

**Costs:**
- May require significant parameter changes
- May break existing encoded data

### Option B: Validate Current Curve
1. Determine intended curve parameters
2. Derive or obtain valid generator point
3. Validate all hardcoded points
4. Estimated effort: 2-3 hours

**Benefits:**
- Minimizes changes
- Preserves existing data

**Costs:**
- May be using non-standard curve
- Loses Zcash compatibility

## Recommended Action
**Adopt Option A (Official Zcash Jubjub).** The current implementation is fundamentally broken with an invalid generator point. Using the official spec is lower risk and enables proper interoperability.

## Code Changes Made This Session

### Fixed
1. `diversifyHash()`: Added proper cofactor multiplication (`scalarMult(8)`)
2. `recoverX()`: Fixed formula for `a = 1` variant

### Discovered (Not Fixed)
1. Generator point is invalid
2. Curve parameters may be non-standard
3. All dependent cryptographic operations fail

## Test Results
- Before fixes: 87 tests failed
- After fixes: 87 tests still failed (due to generator point issue)
- Generator validation test: **FAILS**

## Next Steps (Priority Order)
1. **CRITICAL**: Obtain or derive valid Jubjub generator point
2. **HIGH**: Verify or correct curve parameters against official spec
3. **HIGH**: Implement proper group hash derivation
4. **MEDIUM**: Test against official Zcash vectors
5. **MEDIUM**: Update documentation with correct parameters

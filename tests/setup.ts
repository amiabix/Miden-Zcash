/**
 * Jest Setup File
 * Handles BigInt serialization and other global test configuration
 */

// Enable BigInt serialization for Jest
// This is needed because Jest uses JSON.stringify internally
// and BigInt cannot be serialized by default

// Add BigInt serializer to JSON
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// Optional: Add custom expect matchers if needed
// expect.extend({ ... });

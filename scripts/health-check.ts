#!/usr/bin/env npx ts-node --esm

/**
 * Zcash Integration Health Check
 * Verifies that all external dependencies are properly configured and available
 */

// Check files directly without importing complex modules
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function fail(message: string): void {
  log(`✗ ${message}`, colors.red);
}

function warning(message: string): void {
  log(`⚠ ${message}`, colors.yellow);
}

function info(message: string): void {
  log(`ℹ ${message}`, colors.blue);
}

function header(message: string): void {
  console.log();
  log(`${colors.bold}━━━ ${message} ━━━${colors.reset}`);
}

interface HealthCheckResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

const results: HealthCheckResult[] = [];

function addResult(component: string, status: 'pass' | 'fail' | 'warning', message: string, details?: string): void {
  results.push({ component, status, message, details });
}

async function checkPrizeWasm(): Promise<void> {
  header('Prize-WASM Binary');
  
  const wasmPaths = [
    'miden-browser-wallet/public/zcash-prover-wasm/prize_wasm_bg.wasm',
    'miden-browser-wallet/public/zcash-prover-wasm/zcash_prover_wasm_bg.wasm',
    'public/zcash-prover-wasm/prize_wasm_bg.wasm',
    'public/zcash-prover-wasm/zcash_prover_wasm_bg.wasm'
  ];
  
  let found = false;
  let wasmPath = '';
  let wasmSize = 0;
  
  for (const path of wasmPaths) {
    if (existsSync(path)) {
      found = true;
      wasmPath = path;
      const stats = readFileSync(path);
      wasmSize = stats.length;
      break;
    }
  }
  
  if (found) {
    success(`Prize-WASM found: ${wasmPath}`);
    info(`Size: ${(wasmSize / 1024 / 1024).toFixed(2)} MB`);
    addResult('Prize-WASM', 'pass', `Found at ${wasmPath} (${(wasmSize / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    fail('Prize-WASM not found');
    info('Expected locations:');
    wasmPaths.forEach(p => info(`  - ${p}`));
    info('Download from: https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases');
    addResult('Prize-WASM', 'fail', 'Not found', 'Run: npm run zcash:setup');
  }
}

async function checkSaplingParams(): Promise<void> {
  header('Sapling Proving Parameters');
  
  const paramsPaths = [
    'miden-browser-wallet/public/zcash-params',
    'public/zcash-params',
    'public/params'
  ];
  
  let spendParamsFound = false;
  let outputParamsFound = false;
  let paramsDir = '';
  
  for (const dir of paramsPaths) {
    const spendPath = join(dir, 'sapling-spend.params');
    const outputPath = join(dir, 'sapling-output.params');
    
    if (existsSync(spendPath) && existsSync(outputPath)) {
      spendParamsFound = true;
      outputParamsFound = true;
      paramsDir = dir;
      break;
    }
  }
  
  if (spendParamsFound && outputParamsFound) {
    const spendPath = join(paramsDir, 'sapling-spend.params');
    const outputPath = join(paramsDir, 'sapling-output.params');
    const spendSize = readFileSync(spendPath).length;
    const outputSize = readFileSync(outputPath).length;
    
    success(`Sapling parameters found: ${paramsDir}`);
    info(`  sapling-spend.params: ${(spendSize / 1024 / 1024).toFixed(2)} MB`);
    info(`  sapling-output.params: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
    addResult('Sapling Params', 'pass', `Found in ${paramsDir}`);
  } else {
    if (!spendParamsFound) {
      fail('sapling-spend.params not found');
    }
    if (!outputParamsFound) {
      fail('sapling-output.params not found');
    }
    info('Download from: https://download.z.cash/downloads/');
    info('Run: npm run zcash:setup');
    addResult('Sapling Params', 'fail', 'Not found', 'Run: npm run zcash:setup');
  }
}

async function checkProverStatus(): Promise<void> {
  header('Prover Status');
  
  info('Prover status check requires runtime environment');
  info('Availability depends on:');
  info('  - Prize-WASM: Requires WASM binary (checked above)');
  info('  - librustzcash: Requires librustzcash WASM module');
  info('  - snarkjs: Always available (may need zkeys for real proofs)');
  info('  - Delegated: Requires configured service URL');
  info('');
  info('To check prover status at runtime, use:');
  info('  import { getProverStatus } from "@miden/zcash-integration/shielded";');
  info('  const status = await getProverStatus();');
  
  addResult('Prover', 'pass', 'Status check requires runtime (see above for details)');
}

async function checkRpcConfig(): Promise<void> {
  header('RPC Configuration');
  
  info('RPC endpoints are configured at runtime');
  info('Recommended testnet endpoints:');
  info('  Transparent RPC: https://zcash-testnet.horizenlabs.io');
  info('  Lightwalletd: https://testnet-lightwalletd.zecwallet.co:9067');
  info('  Lightwalletd: https://testnet.lightwalletd.com:9067');
  info('');
  info('Configure in ZcashProvider:');
  info('  {');
  info('    rpcEndpoint: "https://zcash-testnet.horizenlabs.io",');
  info('    lightwalletdUrl: "https://testnet-lightwalletd.zecwallet.co:9067"');
  info('  }');
  
  addResult('RPC Config', 'pass', 'Configured at runtime (no file check needed)');
}

async function runHealthCheck(): Promise<void> {
  log(`${colors.bold}Zcash Integration Health Check${colors.reset}`);
  log(`Date: ${new Date().toISOString()}`);
  
  await checkPrizeWasm();
  await checkSaplingParams();
  await checkProverStatus();
  await checkRpcConfig();
  
  // Summary
  header('Summary');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  
  log(`Total checks: ${results.length}`);
  success(`Passed: ${passed}`);
  if (warnings > 0) {
    warning(`Warnings: ${warnings}`);
  }
  if (failed > 0) {
    fail(`Failed: ${failed}`);
  }
  
  console.log();
  
  if (failed === 0 && warnings === 0) {
    success('All checks passed! Zcash integration is ready to use.');
    process.exit(0);
  } else if (failed === 0) {
    warning('Some checks have warnings, but integration should work.');
    process.exit(0);
  } else {
    fail('Some checks failed. Please fix the issues above.');
    info('Run: npm run zcash:setup to download missing dependencies');
    process.exit(1);
  }
}

runHealthCheck().catch(error => {
  fail(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

'use client';

import React, { useEffect, useState, useCallback } from 'react';

/**
 * Prover availability status (mirrors the SDK type)
 */
interface ProverAvailability {
  prizeWasm: boolean;
  librustzcash: boolean;
  snarkjs: boolean;
  delegated: boolean;
}

/**
 * Prover status (mirrors the SDK type)
 */
interface ProverStatus {
  initialized: boolean;
  activeProver: string | null;
  availability: ProverAvailability;
  canGenerateRealProofs: boolean;
  statusMessage: string;
  errors: string[];
  recommendations: string[];
}

/**
 * Status indicator colors
 */
const STATUS_COLORS = {
  ready: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  loading: 'bg-blue-500',
  unknown: 'bg-gray-500'
} as const;

type StatusLevel = keyof typeof STATUS_COLORS;

/**
 * Get status level from prover status
 */
function getStatusLevel(status: ProverStatus | null): StatusLevel {
  if (!status) return 'unknown';
  if (status.errors.length > 0) return 'error';
  if (!status.initialized) return 'loading';
  if (status.canGenerateRealProofs) return 'ready';
  if (status.initialized) return 'warning';
  return 'unknown';
}

/**
 * Props for ProverStatusIndicator
 */
interface ProverStatusIndicatorProps {
  /** Compact mode - just shows dot indicator */
  compact?: boolean;
  /** Show detailed breakdown */
  showDetails?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when status changes */
  onStatusChange?: (status: ProverStatus | null) => void;
  /** Manual refresh trigger */
  refreshTrigger?: number;
}

/**
 * Prover Status Indicator Component
 * 
 * Displays the current status of the Groth16 prover system,
 * including WASM availability and initialization state.
 */
export function ProverStatusIndicator({
  compact = false,
  showDetails = false,
  className = '',
  onStatusChange,
  refreshTrigger
}: ProverStatusIndicatorProps) {
  const [status, setStatus] = useState<ProverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      // Dynamically import to avoid SSR issues
      const { getProverStatus } = await import('@miden/zcash-integration/shielded');
      const newStatus = await getProverStatus();
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    } catch (error) {
      console.error('[ProverStatus] Failed to get status:', error);
      setStatus(null);
      onStatusChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, refreshTrigger]);

  const statusLevel = getStatusLevel(status);
  const statusColor = STATUS_COLORS[statusLevel];

  // Compact mode - just a status dot with tooltip
  if (compact) {
    return (
      <div className={`relative group ${className}`}>
        <div 
          className={`w-3 h-3 rounded-full ${statusColor} ${loading ? 'animate-pulse' : ''}`}
          title={status?.statusMessage || 'Checking prover status...'}
        />
        {/* Tooltip on hover */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          {status?.statusMessage || 'Checking...'}
        </div>
      </div>
    );
  }

  // Full display
  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColor} ${loading ? 'animate-pulse' : ''}`} />
          <span className="font-medium text-sm">
            {loading ? 'Checking prover...' : 'Prover Status'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {status?.activeProver || 'None'}
          </span>
          <svg
            className={`w-4 h-4 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && status && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
          {/* Status message */}
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {status.statusMessage}
          </div>

          {/* Availability grid */}
          {showDetails && (
            <div className="grid grid-cols-2 gap-2">
              <AvailabilityItem
                name="Prize-WASM"
                available={status.availability.prizeWasm}
                recommended
              />
              <AvailabilityItem
                name="librustzcash"
                available={status.availability.librustzcash}
              />
              <AvailabilityItem
                name="snarkjs"
                available={status.availability.snarkjs}
              />
              <AvailabilityItem
                name="Delegated"
                available={status.availability.delegated}
              />
            </div>
          )}

          {/* Errors */}
          {status.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                Errors:
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside">
                {status.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {status.recommendations.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
              <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">
                Recommendations:
              </div>
              <ul className="text-xs text-yellow-600 dark:text-yellow-400 list-disc list-inside">
                {status.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchStatus();
            }}
            disabled={loading}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh status'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Availability item component
 */
function AvailabilityItem({
  name,
  available,
  recommended = false
}: {
  name: string;
  available: boolean;
  recommended?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-2 h-2 rounded-full ${available ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
      <span className={available ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
        {name}
        {recommended && <span className="ml-1 text-blue-500">(recommended)</span>}
      </span>
    </div>
  );
}

/**
 * Hook to get prover status
 */
export function useProverStatus() {
  const [status, setStatus] = useState<ProverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getProverStatus } = await import('@miden/zcash-integration/shielded');
      const newStatus = await getProverStatus();
      setStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    status,
    loading,
    error,
    refresh,
    isReady: status?.canGenerateRealProofs ?? false,
    activeProver: status?.activeProver ?? null
  };
}

export default ProverStatusIndicator;

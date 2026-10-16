/**
 * NetworkProvider — Issue 1
 * "Design heavily offline-capable degraded application logic protecting
 *  user operations natively"
 *
 * - Monitors connectivity via @react-native-community/netinfo
 * - Exposes useNetwork() hook: { isOnline, networkType, syncStatus }
 * - Automatically drains the OfflineQueue when connectivity is restored
 * - Shows a persistent offline banner via useOfflineBanner()
 * - All queued mutations survive app restarts (AsyncStorage-backed)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import {
  dequeue,
  getRetryableOps,
  markRetry,
} from './OfflineQueue';
import { resolveOperationConflict } from './ConflictResolution';
import { NetworkState, SyncStatus, QueuedOperation } from '../types';

// ─── Context ──────────────────────────────────────────────────────────────────

interface NetworkContextValue {
  isOnline: boolean;
  networkState: NetworkState;
  networkType: string | null;
  syncStatus: SyncStatus;
  pendingOpsCount: number;
  /** Manually trigger a sync flush (called automatically on reconnect). */
  flushQueue: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  networkState: 'unknown',
  networkType: null,
  syncStatus: 'synced',
  pendingOpsCount: 0,
  flushQueue: async () => {},
});

// ─── Queue flush ──────────────────────────────────────────────────────────────

/**
 * Replay a single queued operation against the real API.
 * Replace the fetch call with your actual API client in production.
 *
 * A `409 Conflict` on an `update` means the server has a newer version of
 * the resource than the one this op was built against. Rather than treating
 * that as a plain failure (which would just retry with the same stale
 * payload until MAX_RETRIES and lose the local edit to the dead-letter
 * queue), resolve it per the entity's conflict policy — see
 * `docs/adr/0001-offline-conflict-resolution.md` and
 * `offline/ConflictResolution.ts` — and retry once with the resolved
 * payload.
 */
async function replayOperation(op: QueuedOperation): Promise<void> {
  const method = op.type === 'delete' ? 'DELETE' : op.type === 'create' ? 'POST' : 'PUT';
  const response = await fetch(op.endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: op.type !== 'delete' ? JSON.stringify(op.payload) : undefined,
  });

  if (response.ok) {
    return;
  }

  if (response.status === 409 && op.type === 'update') {
    let remote: Record<string, unknown> | null = null;
    try {
      remote = await response.json();
    } catch {
      remote = null;
    }

    if (remote) {
      const resolved = resolveOperationConflict(op, remote);
      const retryResponse = await fetch(op.endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolved),
      });
      if (!retryResponse.ok) {
        throw new Error(`HTTP ${retryResponse.status}`);
      }
      return;
    }
  }

  throw new Error(`HTTP ${response.status}`);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [networkState, setNetworkState] = useState<NetworkState>('unknown');
  const [networkType, setNetworkType]   = useState<string | null>(null);
  const [syncStatus, setSyncStatus]     = useState<SyncStatus>('synced');
  const [pendingOpsCount, setPendingOpsCount] = useState(0);
  const isFlushing = useRef(false);

  // ── Refresh pending count ──────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    const ops = await getRetryableOps();
    setPendingOpsCount(ops.length);
  }, []);

  // ── Drain the queue ────────────────────────────────────────────────────────
  const flushQueue = useCallback(async () => {
    if (isFlushing.current) return;
    isFlushing.current = true;
    setSyncStatus('syncing');

    try {
      const ops = await getRetryableOps();
      if (ops.length === 0) {
        setSyncStatus('synced');
        return;
      }

      let hadError = false;
      for (const op of ops) {
        try {
          await replayOperation(op);
          await dequeue(op.id);
        } catch {
          const movedToDLQ = await markRetry(op.id);
          hadError = true;
          if (movedToDLQ) {
            // Op exhausted all retries — caller should surface a user notification
            console.warn(`[OfflineQueue] op ${op.id} moved to dead-letter queue after ${op.retries + 1} failures`);
          }
        }
      }

      setSyncStatus(hadError ? 'error' : 'synced');
      await refreshCount();
    } finally {
      isFlushing.current = false;
    }
  }, [refreshCount]);

  // ── NetInfo subscription ───────────────────────────────────────────────────
  useEffect(() => {
    refreshCount();

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setNetworkState(online ? 'online' : 'offline');
      setNetworkType(state.type ?? null);

      if (online) {
        // Connectivity restored — drain the queue
        flushQueue();
      }
    });

    // Fetch initial state
    NetInfo.fetch().then((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setNetworkState(online ? 'online' : 'offline');
      setNetworkType(state.type ?? null);
    });

    return unsubscribe;
  }, [flushQueue, refreshCount]);

  const value = useMemo<NetworkContextValue>(
    () => ({
      isOnline: networkState === 'online',
      networkState,
      networkType,
      syncStatus,
      pendingOpsCount,
      flushQueue,
    }),
    [networkState, networkType, syncStatus, pendingOpsCount, flushQueue],
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}

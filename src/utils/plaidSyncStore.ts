import { reactive, readonly } from 'vue';
import type { PlaidCatchUpDecision } from 'src/utils/plaidCatchUpGuard';

const state = reactive({
  lastError: '' as string,
  mfaPaused: false,
  applying: false,
  lastSyncAt: null as string | null,
  catchUpBlocked: null as Extract<
    PlaidCatchUpDecision,
    { allow: false }
  > | null,
});

/** Reactive Plaid background sync state (loop writes, UI reads). */
export const plaidSyncStore = readonly(state);

export function setPlaidSyncLastError(error: string): void {
  state.lastError = error;
}

export function clearPlaidSyncLastError(): void {
  state.lastError = '';
}

export function setPlaidSyncMfaPaused(paused: boolean): void {
  state.mfaPaused = paused;
}

export function setPlaidSyncApplying(applying: boolean): void {
  state.applying = applying;
}

export function setPlaidSyncLastSyncAt(iso: string | null): void {
  state.lastSyncAt = iso;
}

export function setPlaidSyncCatchUpBlocked(
  blocked: Extract<PlaidCatchUpDecision, { allow: false }> | null
): void {
  state.catchUpBlocked = blocked;
}

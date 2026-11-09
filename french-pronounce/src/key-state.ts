export const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface ApiKeyRecord {
  id: string;
  label: string;
  secret: string;
  enabled: boolean;
  createdAt: number;
  blockedUntil?: number;
  lastError?: string;
  lastErrorAt?: number;
  lastUsedAt?: number;
  requests: number;
  submittedCharacters: number;
  successfulCharacters: number;
  failures: number;
  cycleCharacters: number;
  cycleFailures: number;
}

export interface KeyState {
  keys: ApiKeyRecord[];
  lastUsedId?: string;
}

export function reactivateKey(key: ApiKeyRecord): void {
  delete key.blockedUntil;
  delete key.lastError;
  delete key.lastErrorAt;
  key.cycleCharacters = 0;
  key.cycleFailures = 0;
}

export function refreshExpiredKeys(state: KeyState, now = Date.now()): boolean {
  let changed = false;
  for (const key of state.keys) {
    if (key.blockedUntil !== undefined && key.blockedUntil <= now) {
      reactivateKey(key);
      changed = true;
    }
  }
  return changed;
}

export function reserveKey(state: KeyState, excludedIds: string[], characters: number, now = Date.now()): ApiKeyRecord | undefined {
  refreshExpiredKeys(state, now);
  const start = state.keys.findIndex((key) => key.id === state.lastUsedId);
  for (let offset = 1; offset <= state.keys.length; offset++) {
    const key = state.keys[(start + offset) % state.keys.length];
    if (!key.enabled || key.blockedUntil || excludedIds.includes(key.id)) continue;
    state.lastUsedId = key.id;
    key.requests++;
    key.submittedCharacters += characters;
    key.cycleCharacters += characters;
    key.lastUsedAt = now;
    return { ...key };
  }
  return undefined;
}

export function failKey(key: ApiKeyRecord, safeError: string, now = Date.now()): void {
  key.blockedUntil = now + COOLDOWN_MS;
  key.lastError = safeError;
  key.lastErrorAt = now;
  key.failures++;
  key.cycleFailures++;
}

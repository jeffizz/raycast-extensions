export const MAX_WEIGHT = 1000;

export interface ApiKeyRecord {
  id: string;
  label: string;
  secret: string;
  enabled: boolean;
  /** Relative selection share among eligible keys. Must be > 0. */
  weight: number;
  createdAt: number;
  /** Set after any request failure. Invalid keys are skipped until manually reactivated. */
  invalid?: boolean;
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
}

export function isEligible(key: ApiKeyRecord): boolean {
  return key.enabled && !key.invalid && key.weight > 0;
}

export function reactivateKey(key: ApiKeyRecord): void {
  delete key.invalid;
  delete key.lastError;
  delete key.lastErrorAt;
  key.cycleCharacters = 0;
  key.cycleFailures = 0;
}

/** Upgrades records saved by the previous round-robin/cooldown version. */
export function migrateKeyState(state: KeyState): void {
  const legacy = state as KeyState & { lastUsedId?: string };
  delete legacy.lastUsedId;
  for (const key of state.keys) {
    const old = key as ApiKeyRecord & { blockedUntil?: number };
    if (typeof key.weight !== "number" || !Number.isFinite(key.weight)) key.weight = 1;
    if (old.blockedUntil !== undefined) {
      // Previously blocked keys were failing; keep them blocked until manually reactivated.
      delete old.blockedUntil;
      key.invalid = true;
    }
  }
}

/** Picks one eligible key at random, with probability proportional to its weight. */
export function reserveKey(state: KeyState, excludedIds: string[], characters: number, now = Date.now()): ApiKeyRecord | undefined {
  const eligible = state.keys.filter((key) => isEligible(key) && !excludedIds.includes(key.id));
  if (eligible.length === 0) return undefined;
  const total = eligible.reduce((sum, key) => sum + key.weight, 0);
  let target = Math.random() * total;
  let chosen = eligible[eligible.length - 1];
  for (const key of eligible) {
    if (target < key.weight) { chosen = key; break; }
    target -= key.weight;
  }
  chosen.requests++;
  chosen.submittedCharacters += characters;
  chosen.cycleCharacters += characters;
  chosen.lastUsedAt = now;
  return { ...chosen };
}

/** Records every failure; only `invalidate` (auth error or no credits) disables the key. */
export function failKey(key: ApiKeyRecord, safeError: string, invalidate: boolean, now = Date.now()): void {
  if (invalidate) key.invalid = true;
  key.lastError = safeError;
  key.lastErrorAt = now;
  key.failures++;
  key.cycleFailures++;
}

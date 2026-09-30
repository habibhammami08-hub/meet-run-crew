// Cache mémoire de la liste des sessions de la carte (affichage instantané au retour).
export const SESSIONS_CACHE_TTL_MS = 20_000;
let entry: { key: string; at: number; data: unknown[] } | null = null;

export const getSessionsCache = () => entry;
export const setSessionsCache = (key: string, data: unknown[]) => {
  entry = { key, at: Date.now(), data };
};
/** À appeler après toute création/modification pour forcer un rechargement frais. */
export const invalidateSessionsCache = () => {
  if (entry) entry = { ...entry, at: 0 };
};

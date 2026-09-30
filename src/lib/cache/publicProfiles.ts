import { supabase } from "@/integrations/supabase/client";

// Cache mémoire des profils publics (prénom, âge, photo) : ils changent peu,
// on évite de les redemander au serveur à chaque fiche ouverte.
const TTL_MS = 5 * 60 * 1000;
type PublicProfile = { id: string; full_name: string | null; age: number | null; avatar_url: string | null };
const cache = new Map<string, { at: number; value: PublicProfile | null }>();

export async function getPublicProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const now = Date.now();
  const unique = [...new Set(ids.filter(Boolean))];
  const missing = unique.filter((id) => {
    const hit = cache.get(id);
    return !hit || now - hit.at > TTL_MS;
  });
  if (missing.length) {
    const { data, error } = await (supabase as any)
      .from("profiles_public_open")
      .select("id, full_name, age, avatar_url")
      .in("id", missing);
    if (!error) {
      const found = new Map<string, PublicProfile>((data ?? []).map((p: PublicProfile) => [p.id, p]));
      missing.forEach((id) => cache.set(id, { at: now, value: found.get(id) ?? null }));
    }
  }
  const out = new Map<string, PublicProfile>();
  unique.forEach((id) => {
    const v = cache.get(id)?.value;
    if (v) out.set(id, v);
  });
  return out;
}

export function invalidatePublicProfile(id: string) {
  cache.delete(id);
}

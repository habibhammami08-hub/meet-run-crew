/**
 * Utility function to check if user has an active subscription
 */
export function hasActiveSub(profile?: { 
  sub_status?: string; 
  sub_current_period_end?: string | null 
}) {
  if (!profile) return false;
  
  const active = profile.sub_status === 'active' || profile.sub_status === 'trialing';
  const notExpired = profile.sub_current_period_end && 
    new Date(profile.sub_current_period_end).getTime() > Date.now();
  
  return !!(active && notExpired);
}
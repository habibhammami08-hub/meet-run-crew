import { useEffect, useState } from 'react';
import { getSupabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface UseRealtimeProps {
  table: string;
  filter?: string;
  onUpdate?: (payload: any) => void;
  onInsert?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

export const useRealtime = ({ table, filter, onUpdate, onInsert, onDelete }: UseRealtimeProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const supabase = getSupabase();

  useEffect(() => {
    if (!supabase) {
      logger.warn('[realtime] Supabase client not available');
      return;
    }

    const channelName = `realtime-${table}-${Date.now()}`;
    logger.debug(`[realtime] Setting up channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter || undefined
        },
        (payload) => {
          logger.debug(`[realtime] Received event:`, payload);
          
          switch (payload.eventType) {
            case 'INSERT':
              onInsert?.(payload);
              break;
            case 'UPDATE':
              onUpdate?.(payload);
              break;
            case 'DELETE':
              onDelete?.(payload);
              break;
          }
        }
      )
      .subscribe((status) => {
        logger.debug(`[realtime] Channel ${channelName} status:`, status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      logger.debug(`[realtime] Cleaning up channel: ${channelName}`);
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [supabase, table, filter, onUpdate, onInsert, onDelete]);

  return { isConnected };
};

// Hook spécialisé pour les sessions
export const useSessionsRealtime = (onSessionChange?: (payload: any) => void) => {
  return useRealtime({
    table: 'sessions',
    filter: 'status=eq.published',
    onInsert: onSessionChange,
    onUpdate: onSessionChange,
    onDelete: onSessionChange
  });
};

// Hook spécialisé pour les enrollments
export const useEnrollmentsRealtime = (userId?: string, onEnrollmentChange?: (payload: any) => void) => {
  return useRealtime({
    table: 'enrollments',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    onInsert: onEnrollmentChange,
    onUpdate: onEnrollmentChange,
    onDelete: onEnrollmentChange
  });
};
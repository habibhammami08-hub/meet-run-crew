import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Clock, Users, Euro, Calendar } from 'lucide-react';
import type { SessionWithDetails } from '@/types/database';

interface SessionCardProps {
  session: SessionWithDetails;
  onEnroll?: (sessionId: string) => void;
  onViewDetails?: (sessionId: string) => void;
  isEnrolling?: boolean;
  userCanEnroll?: boolean;
  currentUserId?: string;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onEnroll,
  onViewDetails,
  isEnrolling = false,
  userCanEnroll = true,
  currentUserId
}) => {
  const spotsLeft = session.available_spots || 0;
  const isFull = spotsLeft <= 0;
  const isPast = new Date(session.scheduled_at) < new Date();
  const isOwnSession = currentUserId === session.host_id;
  
  const intensityConfig = {
    low: { label: 'Facile', className: 'bg-green-100 text-green-800 border-green-200' },
    medium: { label: 'Modéré', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high: { label: 'Intense', className: 'bg-red-100 text-red-800 border-red-200' }
  };

  const typeLabels = {
    mixed: 'Mixte',
    women_only: 'Femmes uniquement',
    men_only: 'Hommes uniquement'
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('fr-FR', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
      }),
      time: date.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  const getSessionStatus = () => {
    if (isPast) return { label: 'Terminé', variant: 'secondary' as const };
    if (isFull) return { label: 'Complet', variant: 'destructive' as const };
    if (isOwnSession) return { label: 'Ma session', variant: 'default' as const };
    return { label: 'Disponible', variant: 'default' as const };
  };

  const { date, time } = formatDate(session.scheduled_at);
  const status = getSessionStatus();
  const intensity = intensityConfig[session.intensity];

  const handleEnrollClick = () => {
    if (onEnroll && !isEnrolling && userCanEnroll && !isPast && !isFull && !isOwnSession) {
      onEnroll(session.id);
    }
  };

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(session.id);
    }
  };

  return (
    <Card className="w-full max-w-sm mx-auto hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
      <CardContent className="p-5">
        {/* Header avec statut */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-lg line-clamp-2 flex-1 mr-2">
            {session.title}
          </h3>
          <Badge variant={status.variant} className="shrink-0">
            {status.label}
          </Badge>
        </div>

        {/* Host info */}
        <div className="flex items-center gap-3 mb-4 p-2 bg-muted/50 rounded-lg">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session.host_avatar || ''} alt={session.host_name || ''} />
            <AvatarFallback className="text-xs">
              {session.host_name?.charAt(0) || 'H'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {session.host_name || 'Host anonyme'}
            </p>
            <p className="text-xs text-muted-foreground">Organisateur</p>
          </div>
        </div>

        {/* Session details */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <span className="font-medium">{date}</span>
              <span className="text-muted-foreground ml-2">{time}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{session.duration_minutes || 60} min</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="line-clamp-1 flex-1">
              {session.location_hint || 'Localisation à confirmer'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              {session.current_enrollments || 0}/{session.max_participants} participants
            </span>
            {spotsLeft > 0 && (
              <span className="text-green-600 text-xs ml-1">
                ({spotsLeft} place{spotsLeft > 1 ? 's' : ''})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Euro className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold">{formatPrice(session.price_cents)}€</span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className={intensity.className}>
            {intensity.label}
          </Badge>
          <Badge variant="outline">
            {typeLabels[session.session_type]}
          </Badge>
          <Badge variant="outline">
            {session.distance_km}km
          </Badge>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0 flex gap-2">
        {/* Bouton détails */}
        <Button 
          variant="outline" 
          onClick={handleViewDetails}
          className="flex-1"
        >
          Détails
        </Button>

        {/* Bouton inscription */}
        {!isPast && !isOwnSession && (
          <Button 
            onClick={handleEnrollClick}
            disabled={isEnrolling || !userCanEnroll || isFull}
            className="flex-1"
            variant={isFull ? "secondary" : "default"}
          >
            {isEnrolling ? 'Inscription...' : 
             isFull ? 'Complet' : 
             'S\'inscrire'}
          </Button>
        )}
        
        {isOwnSession && !isPast && (
          <Button 
            variant="outline" 
            onClick={handleViewDetails}
            className="flex-1"
          >
            Gérer
          </Button>
        )}
        
        {isPast && (
          <Button 
            variant="ghost" 
            disabled 
            className="flex-1"
          >
            Terminé
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default SessionCard;
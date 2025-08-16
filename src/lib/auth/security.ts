import type { Session, Profile, Enrollment } from '@/types/database';

export const SECURITY_RULES = {
  // Seules les infos essentielles des hosts sont publiques
  PUBLIC_PROFILE_FIELDS: ['id', 'full_name', 'avatar_url'] as const,
  
  // Limites de sécurité
  MAX_SESSIONS_PER_DAY: 3,
  MAX_ENROLLMENTS_PER_USER_PER_DAY: 5,
  MIN_TIME_BETWEEN_SESSIONS: 2 * 60 * 60 * 1000, // 2 heures
  MAX_SESSION_DURATION: 4 * 60, // 4 heures en minutes
  MAX_ADVANCE_BOOKING_DAYS: 90,
  
  // Validation stricte côté client
  validateSessionAccess: (session: Session | null, user: Profile | null): boolean => {
    if (!session || !user) return false;
    if (session.status !== 'published') return false;
    if (new Date(session.scheduled_at) <= new Date()) return false;
    return true;
  },
  
  // Validation enrollment
  canEnroll: (
    session: Session | null, 
    user: Profile | null, 
    enrollments: Enrollment[] = []
  ): { canEnroll: boolean; reason?: string } => {
    if (!session || !user) {
      return { canEnroll: false, reason: 'Session ou utilisateur manquant' };
    }
    
    // L'host ne peut pas s'inscrire à sa propre session
    if (session.host_id === user.id) {
      return { canEnroll: false, reason: 'Vous ne pouvez pas vous inscrire à votre propre session' };
    }
    
    // Vérifier si déjà inscrit
    const existingEnrollment = enrollments.find(e => 
      e.user_id === user.id && 
      ['pending', 'paid', 'confirmed', 'present'].includes(e.status)
    );
    
    if (existingEnrollment) {
      return { canEnroll: false, reason: 'Vous êtes déjà inscrit à cette session' };
    }
    
    // Vérifier si la session est complète
    const confirmedEnrollments = enrollments.filter(e => 
      ['paid', 'confirmed', 'present'].includes(e.status)
    ).length;
    
    if (confirmedEnrollments >= session.max_participants) {
      return { canEnroll: false, reason: 'Cette session est complète' };
    }
    
    // Vérifier si la session est dans le futur
    if (new Date(session.scheduled_at) <= new Date()) {
      return { canEnroll: false, reason: 'Cette session a déjà eu lieu' };
    }
    
    // Vérifier si la session est publiée
    if (session.status !== 'published') {
      return { canEnroll: false, reason: 'Cette session n\'est pas disponible' };
    }
    
    return { canEnroll: true };
  },
  
  // Validation de création de session
  validateSessionCreation: (
    sessionData: Partial<Session>, 
    user: Profile | null
  ): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!user) {
      errors.push('Utilisateur non authentifié');
      return { isValid: false, errors };
    }
    
    // Validation des champs obligatoires
    if (!sessionData.title?.trim()) {
      errors.push('Le titre est obligatoire');
    }
    
    if (!sessionData.scheduled_at) {
      errors.push('La date est obligatoire');
    } else {
      const sessionDate = new Date(sessionData.scheduled_at);
      const now = new Date();
      const maxDate = new Date(now.getTime() + (SECURITY_RULES.MAX_ADVANCE_BOOKING_DAYS * 24 * 60 * 60 * 1000));
      
      if (sessionDate <= now) {
        errors.push('La session doit être dans le futur');
      }
      
      if (sessionDate > maxDate) {
        errors.push(`La session ne peut pas être programmée plus de ${SECURITY_RULES.MAX_ADVANCE_BOOKING_DAYS} jours à l'avance`);
      }
    }
    
    if (!sessionData.start_lat || !sessionData.start_lng) {
      errors.push('La position de départ est obligatoire');
    }
    
    if (!sessionData.distance_km || sessionData.distance_km <= 0 || sessionData.distance_km > 50) {
      errors.push('La distance doit être entre 0.1 et 50 km');
    }
    
    if (!sessionData.max_participants || sessionData.max_participants < 2 || sessionData.max_participants > 20) {
      errors.push('Le nombre de participants doit être entre 2 et 20');
    }
    
    if (!sessionData.min_participants || sessionData.min_participants < 2) {
      errors.push('Le nombre minimum de participants doit être d\'au moins 2');
    }
    
    if (sessionData.min_participants && sessionData.max_participants && 
        sessionData.min_participants > sessionData.max_participants) {
      errors.push('Le minimum ne peut pas être supérieur au maximum de participants');
    }
    
    if (!sessionData.price_cents || sessionData.price_cents < 0 || sessionData.price_cents > 10000) {
      errors.push('Le prix doit être entre 0 et 100€');
    }
    
    if (!sessionData.duration_minutes || sessionData.duration_minutes < 30 || 
        sessionData.duration_minutes > SECURITY_RULES.MAX_SESSION_DURATION) {
      errors.push(`La durée doit être entre 30 minutes et ${SECURITY_RULES.MAX_SESSION_DURATION / 60} heures`);
    }
    
    if (!['low', 'medium', 'high'].includes(sessionData.intensity as string)) {
      errors.push('L\'intensité doit être spécifiée');
    }
    
    if (!['mixed', 'women_only', 'men_only'].includes(sessionData.session_type as string)) {
      errors.push('Le type de session doit être spécifié');
    }
    
    return { isValid: errors.length === 0, errors };
  },
  
  // Validation de mise à jour de profil
  validateProfileUpdate: (
    profileData: Partial<Profile>
  ): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (profileData.full_name !== undefined && !profileData.full_name?.trim()) {
      errors.push('Le nom complet ne peut pas être vide');
    }
    
    if (profileData.age !== undefined && (profileData.age < 16 || profileData.age > 99)) {
      errors.push('L\'âge doit être entre 16 et 99 ans');
    }
    
    if (profileData.phone !== undefined && profileData.phone && 
        !/^(\+33|0)[1-9](\d{8})$/.test(profileData.phone.replace(/\s/g, ''))) {
      errors.push('Le numéro de téléphone n\'est pas valide');
    }
    
    if (profileData.gender !== undefined && profileData.gender && 
        !['homme', 'femme', 'autre'].includes(profileData.gender)) {
      errors.push('Le genre spécifié n\'est pas valide');
    }
    
    return { isValid: errors.length === 0, errors };
  },
  
  // Sanitisation des données
  sanitizeProfileData: (data: Partial<Profile>): Partial<Profile> => {
    const sanitized: Partial<Profile> = {};
    
    if (data.full_name !== undefined) {
      sanitized.full_name = data.full_name?.trim() || null;
    }
    
    if (data.first_name !== undefined) {
      sanitized.first_name = data.first_name?.trim() || null;
    }
    
    if (data.last_name !== undefined) {
      sanitized.last_name = data.last_name?.trim() || null;
    }
    
    if (data.phone !== undefined) {
      sanitized.phone = data.phone?.replace(/\s/g, '') || null;
    }
    
    if (data.age !== undefined) {
      sanitized.age = data.age;
    }
    
    if (data.gender !== undefined) {
      sanitized.gender = data.gender;
    }
    
    return sanitized;
  },
  
  // Vérification des permissions
  canModifySession: (session: Session | null, user: Profile | null): boolean => {
    if (!session || !user) return false;
    if (user.role === 'admin') return true;
    return session.host_id === user.id;
  },
  
  canViewEnrollments: (session: Session | null, user: Profile | null): boolean => {
    if (!session || !user) return false;
    if (user.role === 'admin') return true;
    return session.host_id === user.id;
  },
  
  // Rate limiting (côté client - à compléter côté serveur)
  checkRateLimit: (userId: string, action: string): boolean => {
    const key = `${userId}-${action}`;
    const now = Date.now();
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      localStorage.setItem(key, JSON.stringify({ count: 1, timestamp: now }));
      return true;
    }
    
    try {
      const { count, timestamp } = JSON.parse(stored);
      
      // Reset si plus d'une heure
      if (now - timestamp > 60 * 60 * 1000) {
        localStorage.setItem(key, JSON.stringify({ count: 1, timestamp: now }));
        return true;
      }
      
      // Limites par action
      const limits: Record<string, number> = {
        'create-session': 3,
        'enroll': 5,
        'profile-update': 10
      };
      
      const limit = limits[action] || 10;
      
      if (count >= limit) {
        return false;
      }
      
      localStorage.setItem(key, JSON.stringify({ count: count + 1, timestamp }));
      return true;
    } catch {
      localStorage.setItem(key, JSON.stringify({ count: 1, timestamp: now }));
      return true;
    }
  }
};

// Utilitaires de sécurité
export const SecurityUtils = {
  // Masquer les informations sensibles
  maskEmail: (email: string): string => {
    const [local, domain] = email.split('@');
    if (local.length <= 2) return email;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
  },
  
  // Masquer le téléphone
  maskPhone: (phone: string): string => {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`;
  },
  
  // Vérifier si un utilisateur peut voir les détails complets d'un profil
  canViewFullProfile: (targetProfile: Profile, currentUser: Profile | null): boolean => {
    if (!currentUser) return false;
    if (currentUser.id === targetProfile.id) return true;
    if (currentUser.role === 'admin') return true;
    return false;
  },
  
  // Filtrer les champs publics d'un profil
  getPublicProfileFields: (profile: Profile): Partial<Profile> => {
    return {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url
    };
  }
};
export type DbIntensity = 'low' | 'medium' | 'high';

export function uiToDbIntensity(label: string): DbIntensity {
  switch ((label || '').toLowerCase()) {
    case 'marche': return 'low';
    case 'course modérée':
    case 'course modere': return 'medium';
    case 'course intensive': return 'high';
    default: return 'medium';
  }
}

export function dbToUiIntensity(val?: string | null): string {
  switch (val) {
    case 'low': return 'marche';
    case 'medium': return 'course modérée';
    case 'high': return 'course intensive';
    default: return 'course modérée';
  }
}
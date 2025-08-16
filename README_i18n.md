# 🌍 Internationalisation (i18n) - MeetRun

## Configuration actuelle

L'application MeetRun utilise **react-i18next** pour l'internationalisation avec support automatique du français et de l'anglais.

### Fichiers de traduction
- `src/locales/fr.json` - Traductions françaises (langue par défaut)
- `src/locales/en.json` - Traductions anglaises

### Configuration
- **Fallback** : fr-FR → fr → en
- **Détection** : localStorage → navigateur → HTML lang
- **Stockage** : localStorage avec la clé `meetrun-language`

## Comment ajouter des traductions

### 1. Ajouter une nouvelle clé

Dans `src/locales/fr.json` :
```json
{
  "myNewSection": {
    "title": "Mon nouveau titre",
    "description": "Ma description"
  }
}
```

Dans `src/locales/en.json` :
```json
{
  "myNewSection": {
    "title": "My new title", 
    "description": "My description"
  }
}
```

### 2. Utiliser dans les composants

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('myNewSection.title')}</h1>
      <p>{t('myNewSection.description')}</p>
    </div>
  );
}
```

### 3. Avec interpolation

JSON :
```json
{
  "welcome": "Bienvenue {{name}} !"
}
```

Composant :
```tsx
{t('welcome', { name: 'Pierre' })}
// → "Bienvenue Pierre !"
```

### 4. Pluriels

JSON :
```json
{
  "items": "{{count}} élément",
  "items_plural": "{{count}} éléments"
}
```

Composant :
```tsx
{t('items', { count: 5 })}
// → "5 éléments"
```

## Changer de langue

```tsx
import { i18nHelpers } from '@/i18n';

// Changer vers l'anglais
i18nHelpers.changeLanguage('en');

// Obtenir la langue actuelle
const currentLang = i18nHelpers.getCurrentLanguage();
```

## Structure recommandée

Organisez vos traductions par domaine :

```json
{
  "auth": { "login": "Se connecter" },
  "navigation": { "home": "Accueil" },
  "session": { "join": "Rejoindre" },
  "forms": { "required": "Requis" },
  "buttons": { "save": "Enregistrer" },
  "errors": { "network": "Erreur réseau" }
}
```

## Notes importantes

- ⚠️ **Toujours** ajouter la traduction dans les deux langues
- 🔍 Utilisez des clés descriptives (`auth.login` plutôt que `btn1`)
- 📱 Les traductions sont prêtes pour le mobile (même système)
- 🚀 Fallback automatique vers le français si clé manquante en anglais
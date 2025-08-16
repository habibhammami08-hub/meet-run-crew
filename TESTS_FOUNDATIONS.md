# 🚀 Comment tester rapidement - MeetRun Mobile Foundations

## Tests de validation rapide (5 étapes)

### 1. Test i18n (Internationalisation)
```bash
# Ouvrir console navigateur
import { i18nHelpers } from '@/i18n';

# Changer vers anglais
i18nHelpers.changeLanguage('en');
# → Interface doit passer en anglais

# Retour français
i18nHelpers.changeLanguage('fr');
# → Interface doit repasser en français
```

### 2. Test Storage (Stockage abstrait)
```bash
# Console navigateur
import { storage, storageHelpers } from '@/core/storage';

# Test stockage simple
await storage.set('test-key', 'test-value');
console.log(await storage.get('test-key')); // → 'test-value'

# Test JSON
await storageHelpers.setJSON('test-obj', { name: 'test' });
console.log(await storageHelpers.getJSON('test-obj')); // → { name: 'test' }
```

### 3. Test Deep Links
```bash
# Console navigateur - simuler deep link
window.location.href = 'meetrun://session/123?from=share';
# → Doit naviguer vers /session/123

# Test avec map
window.location.href = 'meetrun://map?city=Paris';
# → Doit naviguer vers /map?city=Paris
```

### 4. Test PWA/Service Worker
```bash
# 1. Build production
npm run build

# 2. Servir en HTTPS local
npx serve dist -s -l 3000

# 3. Ouvrir https://localhost:3000
# 4. Vérifier SW dans DevTools > Application > Service Workers
# 5. Mode avion → doit afficher page offline
```

### 5. Test Notifications (permissions)
```bash
# Console navigateur
import { notifications } from '@/core/notifications';

# Demander permission
await notifications.requestPermission();
# → Popup permission navigateur

# Test notification
await notifications.showNotification({
  title: 'Test MeetRun',
  body: 'Test des notifications',
  icon: '/icon-192.png'
});
# → Notification système
```

## Vérifications visuelles

### ✅ Interface traduite
- Navigation : "Accueil/Home", "Carte/Map", "Profil/Profile"
- Changement instantané selon langue navigateur

### ✅ PWA installable  
- Chrome : icône + dans barre d'adresse
- Mobile : "Ajouter à l'écran d'accueil"

### ✅ Offline fonctionnel
- Mode avion → page offline stylée avec bouton retry
- Retour connexion → redirection automatique

### ✅ Configuration centralisée
- Variables d'env validées au démarrage
- Erreurs claires si config manquante

## Tests mobile (après `npx cap add android/ios`)

### Android
```bash
npx cap run android
# Test deep links avec Intent
adb shell am start -W -a android.intent.action.VIEW -d "meetrun://session/123" com.meetrun.app
```

### iOS
```bash  
npx cap run ios
# Test Universal Links
xcrun simctl openurl booted "meetrun://session/123"
```

## Validation complète ✅

- ✅ App démarre normalement
- ✅ Traductions FR/EN avec fallback
- ✅ Storage abstrait fonctionnel  
- ✅ Deep links routing correct
- ✅ PWA installable + offline
- ✅ Service Worker enregistré
- ✅ Config centralisée validée

**Les fondations mobiles sont prêtes ! 🎯**
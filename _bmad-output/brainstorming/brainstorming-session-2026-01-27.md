---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Service de notification Jellyfin vers WhatsApp avec agregation intelligente'
session_goals: 'Stack technique, logique agregation, format messages, integration WhatsApp, fiabilite, fonctionnalites'
selected_approach: 'progressive-flow'
techniques_used: ['What If Scenarios']
ideas_generated: 115
context_file: ''
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Mathieu
**Date:** 2026-01-27
**Total Ideas Generated:** 115
**Themes Identified:** 12

---

## Session Overview

**Topic:** Service de notification Jellyfin → WhatsApp avec agrégation intelligente

**Goals:**
- Stack technique du service
- Logique d'agrégation et cas limites
- Format des messages WhatsApp
- Intégration WhatsApp (librairies tierces)
- Fiabilité et gestion d'erreurs
- Fonctionnalités complètes

### Architecture Envisagée

```
Jellyfin → Webhooks → Service de publication → WhatsApp (groupes communautaires)
                            ↓
                    Cache/Agrégation
                   (fenêtre configurable)
```

---

## Technique Selection

**Approach:** Progressive Technique Flow
**Technique Used:** What If Scenarios

---

## Complete Idea Inventory

### Theme 1: Architecture & Stack Technique

| # | Idée | Description |
|---|------|-------------|
| 13 | Empreinte minimale | Service ultra-léger en ressources CPU/RAM |
| 14 | Docker réseau Jellyfin | Container partageant le réseau avec Jellyfin, communication locale |
| 15 | Python ou Node.js | Choix pragmatique selon les librairies WhatsApp disponibles |
| 16 | Persistence légère | Fichier JSON ou SQLite, pas de base de données externe |
| 17 | Image Alpine/Slim | Image Docker < 50-100MB pour démarrage rapide |
| 97 | Image tout-en-un | Service + UI web dans une seule image, zéro dépendance externe |
| 107 | Extensible sources | Architecture modulaire prête pour Plex/Emby dans le futur |
| 108 | Extensible destinations | Architecture prête pour Telegram/Discord/Signal dans le futur |

---

### Theme 2: Connexion WhatsApp

| # | Idée | Description |
|---|------|-------------|
| 18 | Numéro personnel | Utiliser votre propre numéro WhatsApp comme émetteur |
| 26 | Reconnexion automatique | Credentials persistés, reconnexion sans QR code |
| 27 | Alerte si reconnexion échoue | Notification seulement quand la reconnexion auto a échoué |
| 28 | Code par notification | Reconnexion via code 8 chiffres envoyé par email/Telegram/Discord |
| 29 | Connexion initiale sans UI | Même flow code pour le premier setup - pas besoin d'accéder à l'UI |
| 30 | Canaux alerte obligatoires | Le .env doit avoir au moins un canal configuré, sinon refus de démarrer |
| 31 | Fallback QR code | Si méthode connexion par code échoue → fallback QR code en UI |
| 77 | Multi-groupes | Un seul numéro émetteur → plusieurs groupes WhatsApp destinataires |

---

### Theme 3: Interface Web (UI)

| # | Idée | Description |
|---|------|-------------|
| 20 | UI web admin | Interface pour paramétrage, connexion WhatsApp, scan QR si nécessaire |
| 21 | Export/Import config | Backup et restore de la configuration en un clic (JSON/YAML) |
| 22 | Auth par mot de passe | Mot de passe défini dans .env, protège l'accès UI |
| 23 | Historique notifications | Page listant les messages envoyés avec date, contenu, statut |
| 24 | Test message éphémère | Bouton test qui envoie un message puis le supprime automatiquement |
| 25 | UI jolie | Design moderne avec Tailwind ou similaire, pas juste fonctionnel |
| 109 | Wizard premier démarrage | Assistant étape par étape au premier lancement |
| 110 | Tooltips contextuels | Icônes ℹ️ avec explications au survol de chaque paramètre |
| 122 | Historique avec statut | Liste avec indicateurs : ✅ envoyé / ⏳ en queue / ❌ échec |
| 123 | Filtres historique | Filtrer par groupe / par type (film/série) / par statut |

---

### Theme 4: Format des Messages

| # | Idée | Description |
|---|------|-------------|
| 1 | Fluidité avant tout | Priorité à la connexion transparente et fiable |
| 2 | Cover + Texte simple | Image de couverture + message épuré, pas de surcharge |
| 4 | Format minimaliste | `Titre (Année)` pour films, `Titre (Année) S01E04-05` pour séries |
| 9 | Troncature 50 chars | Titres > 50 caractères tronqués, caractères spéciaux préservés |
| 10 | Format unifié ajout/suppression | Même structure de message, juste l'emoji/préfixe qui change |
| 48 | Épisodes compacts | S01E04, S01E05 → S01E04-05 pour les consécutifs |
| 68 | Liens ligne séparée | Chaque contenu sur sa ligne, lien `↳ Regarder` en dessous |
| 112 | Caractères spéciaux | Échappement correct des accents, symboles, émojis dans les titres |
| 125 | Emojis personnalisables | 🎬 films, 📺 séries, 🗑️ suppression - modifiables dans l'UI |

**Exemple de message film unique :**
```
🎬 Nouveau film

Inception (2010)
↳ Regarder
```

**Exemple de message multi-séries :**
```
📺 Nouveautés séries

The Last of Us (2023) S01E04-05
↳ Regarder

Breaking Bad (2008) S05E01
↳ Regarder
```

---

### Theme 5: Gestion des Images

| # | Idée | Description |
|---|------|-------------|
| 32 | Hiérarchie posters série | Multi-saisons → poster série / Une saison → poster saison / Un épisode → thumbnail |
| 33 | Patchwork illimité HD | Pas de limite d'images dans le patchwork, qualité HD pour WhatsApp |
| 34 | Pas de texte incrusté | Image pure, le texte reste dans le message WhatsApp |
| 35 | Exclusion si pas de cover | Élément sans cover = pas d'image, ni seul ni dans le patchwork |
| 36 | Patchwork covers existantes | Seulement les éléments avec cover apparaissent dans le patchwork |
| 37 | Grille adaptative | 2 = côte à côte / 3 = 1 grande + 2 petites / 4+ = grille carrée |
| 38 | Mise en avant popularité | Le contenu le plus connu = image la plus grande dans le patchwork |
| 39 | Scoring via API externe | Appel TMDB pour rating + popularité + date de sortie |
| 40 | Algorithme scoring | Score = f(rating × 0.3, popularité × 0.5, récence × 0.2) |
| 41 | Scoring caché | L'algorithme fonctionne en arrière-plan, non exposé dans l'UI |
| 42 | Fallback TMDB → IMDB | Si TMDB ne trouve pas le contenu, tenter IMDB |
| 43 | Fallback ultime | Si aucune API ne répond → ordre d'ajout |
| 124 | Ordre patchwork configurable | Option : popularité (défaut) / ordre d'ajout / alphabétique |

---

### Theme 6: Logique d'Agrégation

| # | Idée | Description |
|---|------|-------------|
| 5 | Patchwork imports massifs | 50+ films = mosaïque visuelle avec liste textuelle |
| 44 | Timer reset post-publication | Nouveau contenu après publication = nouveau timer |
| 45 | Séries différentes groupées | Plusieurs séries dans la même fenêtre = un seul message |
| 46 | Fenêtres séparées films/séries | Deux timers indépendants - films ne retardent pas séries |
| 47 | Durée configurable | 15 minutes par défaut, modifiable dans l'UI |
| 49 | Timers différents | Fenêtre films et fenêtre séries configurables séparément |
| 111 | Déduplication webhooks | Hash du webhook + fenêtre 5 secondes → ignore les doublons |

**Schéma des fenêtres parallèles :**
```
FENÊTRE FILMS                    FENÊTRE SÉRIES
─────────────────               ─────────────────
T+0  : Film A        │          T+2  : S01E01 (Série X)
T+5  : Film B        │          T+4  : S01E02 (Série X)
T+10 : Film C        │          T+7  : S02E01 (Série Y)
T+15 : ⏰ PUBLISH    │          T+17 : ⏰ PUBLISH
       "3 films"     │                 "2 séries"
```

---

### Theme 7: Gestion des Suppressions

| # | Idée | Description |
|---|------|-------------|
| 11 | Vérification existence | Avant notification suppression, vérifier si le contenu existe encore (autre qualité) |
| 12 | Agrégation suppressions | Suppression série entière = un seul message avec liste des épisodes |
| 74 | Suppressions multilingues | "Film supprimé" / "Movie removed" selon la langue du groupe |

---

### Theme 8: Internationalisation (i18n)

| # | Idée | Description |
|---|------|-------------|
| 69 | Templates multilingues | Messages pré-traduits (FR, EN, ES, DE...) |
| 70 | Canal par langue | Groupe WhatsApp FR, Groupe WhatsApp EN... chacun sa langue |
| 71 | Config multi-groupes UI | Interface pour ajouter/supprimer des canaux avec leur langue |
| 72 | Langue obligatoire | L'UI force la sélection d'une langue lors de l'ajout d'un groupe |
| 73 | Pas de filtrage contenu | Tous les groupes reçoivent tout (films + séries) |
| 75 | Résumé en langue UI | Email quotidien dans la langue choisie pour l'interface admin |
| 76 | UI multilingue | Fichiers `locales/fr.json`, `locales/en.json`... contributeurs peuvent ajouter des langues |

**Architecture i18n :**
```
/locales/fr.json  → Interface + Messages FR
/locales/en.json  → Interface + Messages EN
/locales/es.json  → Interface + Messages ES

INTERFACE ADMIN
Langue UI: [Français ▼]  ← Résumé quotidien en FR

CANAUX DE DIFFUSION
├── Groupe "VedFlix FR" │ Langue: FR
├── Groupe "VedFlix EN" │ Langue: EN
└── Groupe "VedFlix ES" │ Langue: ES
```

---

### Theme 9: Monitoring & Alertes

| # | Idée | Description |
|---|------|-------------|
| 19 | Alertes multi-canal | Notifications par Email / Telegram / Discord (configurable) |
| 50 | Discord alertes | Support webhook Discord pour les alertes système |
| 60 | Résumé quotidien email | Email automatique : "Hier : 3 films, 12 épisodes, 0 erreurs" |
| 61 | Santé APIs émojis | Indicateurs temps réel dans l'UI : `TMDB 🟢` `IMDB 🟢` `WhatsApp 🟢` |
| 62 | Heartbeat | Message "Je suis vivant" après X jours sans activité (configurable) |
| 63 | Deux canaux distincts | Email = résumés quotidiens / Canal alerte = temps réel + heartbeat |
| 90 | Alerte N échecs | 3 échecs d'envoi consécutifs → notification sur canal d'alerte |
| 120 | Détection Jellyfin offline | Si aucun webhook + API Jellyfin injoignable → alerte |

---

### Theme 10: Résilience & Gestion d'Erreurs

| # | Idée | Description |
|---|------|-------------|
| 6 | Queue retry 24h | Messages en échec conservés 24h max, retry toutes les 15 min |
| 7 | Pas de déduplication ajout/supp | Si ajout puis suppression rapide, tant pis on poste plusieurs fois |
| 8 | Poster sans image si manquante | L'absence de cover ne bloque pas la notification |
| 87 | Backoff exponentiel | Retry après 1s, puis 2s, puis 4s... Max 3 tentatives |
| 88 | Dégradation gracieuse | TMDB down → on poste quand même, juste sans scoring |
| 89 | Queue persistante | Envoi échoue → message en queue → retry périodique |
| 91 | Distinction type erreur | Timeout réseau → retry / Session expirée → alerte + reconnexion |
| 92 | Webhook malformé | Payload invalide → log l'erreur, ne pas planter |
| 93 | Contenu introuvable | API Jellyfin ne répond pas → on notifie quand même (mieux vaut faux positif) |
| 94 | Image échoue | Génération patchwork/cover impossible → message texte seul |
| 95 | Backup auto persistence | Copie automatique du fichier de persistence (toutes les heures) |
| 96 | État restauré au restart | Queue et credentials persistés sur volume → reprise au redémarrage |
| 121 | Auto-restart interne | Si composant interne plante → redémarrage auto sans restart container |

**Philosophie erreurs :**
- **Ne jamais bloquer** : Dégradation gracieuse, toujours poster quelque chose
- **Ne jamais perdre** : Queue persistante, backups automatiques
- **Alerter intelligemment** : Pas de spam, seulement les vrais problèmes
- **Auto-recovery** : Retry, backoff, restauration au redémarrage

---

### Theme 11: Sécurité

| # | Idée | Description |
|---|------|-------------|
| 84 | UI accessible extérieur | Pas de restriction localhost, protégée par mot de passe |
| 85 | Secret webhook obligatoire | `WEBHOOK_SECRET` dans .env, vérifié à chaque requête Jellyfin |
| 86 | IP whitelist UI | Configurable à chaud depuis l'interface, pas besoin de redémarrer |

**Flux sécurité webhook :**
```
WEBHOOK ENTRANT
├── ✓ Secret valide ?
├── ✓ IP dans whitelist ?
│
├── OUI → Traiter
└── NON → 403 + Log
```

---

### Theme 12: Déploiement & Maintenance

| # | Idée | Description |
|---|------|-------------|
| 98 | Docker Compose fourni | Fichier `docker-compose.yml` prêt à l'emploi |
| 99 | Volume unique | Un seul dossier `/app/data` contient tout : config, queue, credentials, backups |
| 100 | .env.example documenté | Template avec toutes les variables et commentaires explicatifs |
| 101 | Health check endpoint | `/health` retourne statut des services (Docker health, Kubernetes probes) |
| 102 | Versioning sémantique | Tags v1.0.0, v1.1.0... avec changelog clair |
| 103 | Notif nouvelle version | L'UI affiche discrètement "v1.2.0 disponible" |
| 118 | Purge auto logs | Logs > 30 jours automatiquement supprimés (configurable) |
| 119 | Export/Import migration | ZIP complet : config, credentials, queue, historique → restauration totale sur nouvelle installation |

**Structure fichiers :**
```
/mon-serveur/jellyfin-notifier/
├── docker-compose.yml
├── .env                    ← Vos secrets
└── data/                   ← Volume persistant
    ├── config.json
    ├── queue.json
    ├── whatsapp-credentials/
    └── backups/
```

**Fichier .env.example :**
```env
# === OBLIGATOIRE ===
WHATSAPP_PHONE_NUMBER=+33612345678
WEBHOOK_SECRET=votre_secret_ici
UI_PASSWORD=votre_mot_de_passe

# === ALERTES (au moins un) ===
ALERT_EMAIL=vous@example.com
# TELEGRAM_BOT_TOKEN=xxx
# TELEGRAM_CHAT_ID=xxx
# DISCORD_WEBHOOK_URL=xxx

# === OPTIONNEL ===
JELLYFIN_URL=http://jellyfin:8096
TMDB_API_KEY=xxx
REDIRECT_BASE_URL=votre-domaine.example.com
```

---

### Theme 13: Debug & Test

| # | Idée | Description |
|---|------|-------------|
| 104 | Simulateur webhook | Bouton "Simuler un ajout" dans l'UI pour tester le flow complet |
| 105 | Mode dry-run | Toggle "Mode test" → tout s'exécute mais message non envoyé, juste loggé |
| 106 | Prévisualisation message | Voir exactement ce que le groupe recevra avant d'envoyer |

---

### Theme 14: Fonctionnalités Bonus

| # | Idée | Description |
|---|------|-------------|
| 3 | Vision Chatbot | (Hors scope) Groupe séparé pour demandes de films/séries via chatbot |
| 64 | Plage "Ne pas déranger" | Configurable (23h-8h) → notifications retenues et envoyées groupées le matin |
| 65 | Service redirection | URL qui détecte le device et redirige vers app native ou webapp Jellyfin |
| 66 | URL redirection .env | `REDIRECT_BASE_URL` configurable au déploiement |
| 67 | Liens adaptatifs | 1 contenu = lien direct / plusieurs = lien par élément |
| 113 | Fuseau horaire | Configurable dans l'UI pour "ne pas déranger" |
| 114 | Message d'accueil | Premier message du bot dans un nouveau groupe : présentation |

---

## Configuration Summary

### Variables .env (au démarrage)

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| `WHATSAPP_PHONE_NUMBER` | Numéro WhatsApp émetteur | ✅ |
| `WEBHOOK_SECRET` | Secret pour valider les webhooks Jellyfin | ✅ |
| `UI_PASSWORD` | Mot de passe accès interface admin | ✅ |
| `ALERT_EMAIL` | Email pour alertes et résumé quotidien | ⚠️ Au moins un |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram pour alertes | ⚠️ Au moins un |
| `TELEGRAM_CHAT_ID` | Chat ID Telegram | ⚠️ Si Telegram |
| `DISCORD_WEBHOOK_URL` | Webhook Discord pour alertes | ⚠️ Au moins un |
| `JELLYFIN_URL` | URL du serveur Jellyfin | Optionnel |
| `TMDB_API_KEY` | Clé API TMDB pour scoring | Optionnel |
| `REDIRECT_BASE_URL` | Domaine pour liens de redirection | Optionnel |

### Paramètres UI (modifiables à chaud)

- Groupes WhatsApp cibles (avec langue)
- Fenêtre agrégation films
- Fenêtre agrégation séries
- Troncature titre (50 chars défaut)
- IP whitelist webhooks
- Plage "Ne pas déranger"
- Fuseau horaire
- Emojis personnalisés
- Langue interface

---

## Session Summary

### Key Achievements

- **115 idées** générées couvrant tous les aspects du projet
- **12 thèmes** identifiés et organisés
- **Architecture complète** définie de bout en bout
- **Flux de connexion innovant** (code par notification)
- **Système i18n complet** multi-langue multi-groupe
- **Résilience robuste** avec dégradation gracieuse

### Creative Breakthroughs

1. **Connexion WhatsApp par code notifié** : Permet de reconnecter sans accéder à l'UI, juste avec le téléphone
2. **Patchwork intelligent** : Grille adaptative avec mise en avant par popularité
3. **Fenêtres d'agrégation parallèles** : Films et séries indépendants
4. **Monitoring passif** : Résumé quotidien + heartbeat "je suis vivant"

### Session Insights

- Le projet est ambitieux mais bien structuré
- Focus sur la simplicité utilisateur malgré la complexité technique
- Philosophie "ne jamais bloquer, ne jamais perdre"
- Extensibilité prévue pour futures évolutions

---

## Next Steps

1. **Choisir la stack** : Python ou Node.js selon maturité des libs WhatsApp
2. **Prototyper** le webhook listener + connexion WhatsApp
3. **Implémenter** l'agrégation avec fenêtres temporelles
4. **Construire** l'UI web avec les fonctionnalités essentielles
5. **Dockeriser** avec docker-compose.yml prêt à l'emploi
6. **Documenter** avec README complet et .env.example

---

*Session completed: 2026-01-27*
*Generated with BMAD Brainstorming Workflow*

---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
status: 'complete'
inputDocuments: ['brainstorming-session-2026-01-27.md']
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: 'api_backend + web_app'
  domain: 'general'
  complexity: 'low-medium'
  projectContext: 'greenfield'
---

# Product Requirements Document - Jellyfin WhatsApp Notifier

**Author:** Mathieu
**Date:** 2026-01-27

## Executive Summary

Jellyfin WhatsApp Notifier is an autonomous service that monitors a Jellyfin media server and automatically notifies a WhatsApp group when new content is added or removed. The service aggregates notifications intelligently (films and series separately), includes cover images and direct links, and requires zero manual intervention after initial setup. A key innovation is the ability to reconnect WhatsApp via a code sent through alerting channels (email/Telegram/Discord), eliminating the need for web UI access during session recovery.

## Success Criteria

### User Success

- **Notifications groupées intelligemment** : Les utilisateurs reçoivent des notifications bien agrégées, pas de spam (maximum 1-2 messages par événement d'ajout)
- **Fiabilité totale** : 100% des ajouts/suppressions Jellyfin sont notifiés, aucun oubli
- **Messages pertinents** : Chaque notification contient une cover, un titre clair et un lien fonctionnel vers le contenu

### Business Success

- **Zéro intervention manuelle** : Le service tourne sans action de l'administrateur pendant des semaines
- **Aucun message raté** : La queue de retry est efficace, des alertes sont envoyées en cas de problème
- **Setup rapide** : Première notification envoyée en moins de 15 minutes après déploiement

### Technical Success

- **Empreinte légère** : Moins de 100MB RAM, moins de 5% CPU en idle
- **Résilience** : Reconnexion automatique WhatsApp, retry automatique des messages en échec
- **Dégradation gracieuse** : Le service fonctionne même si les APIs externes (TMDB/IMDB) sont indisponibles

### Measurable Outcomes

| Métrique | Cible |
|----------|-------|
| Taux de notification | 100% des événements Jellyfin notifiés |
| Temps de setup | < 15 minutes |
| Uptime | > 99.9% |
| RAM idle | < 100MB |
| CPU idle | < 5% |
| Intervention admin | 0 par mois (hors mises à jour) |

## Product Scope

### MVP Strategy

**Approach:** Problem-Solving MVP - Deliver reliable notifications before adding advanced features.

**Resource Requirements:** 1 developer with Node.js or Python + Vue.js basics.

**User Journeys Supported:** All 3 journeys (Member notification, Admin setup, Admin error recovery).

### MVP - Minimum Viable Product

**Core Features:**
- Réception et traitement des webhooks Jellyfin (ajouts et suppressions)
- Connexion WhatsApp via librairie tierce (1 groupe)
- Agrégation basique avec fenêtre temporelle (films et séries séparés)
- Messages avec cover + titre (année) + lien de redirection
- UI admin basique : connexion WhatsApp, configuration du groupe cible
- Alertes par email/Telegram/Discord si déconnexion WhatsApp
- Connexion par code notifié (sans accès UI obligatoire)
- Déploiement Docker avec docker-compose

### Growth Features (Post-MVP)

**Enhanced Features :**
- Multi-groupes avec langues différentes (i18n)
- Patchwork intelligent (grille adaptative, scoring par popularité TMDB/IMDB)
- Plage "Ne pas déranger" configurable
- Historique des notifications dans l'UI avec filtres
- Mode test/dry-run et prévisualisation des messages
- Export/Import complet de la configuration
- Vérification d'existence avant notification de suppression
- Wizard de premier démarrage

### Vision (Future)

**Future Possibilities :**
- Support autres sources média (Plex, Emby)
- Support autres destinations (Telegram natif, Discord natif, Signal)
- Statistiques avancées et graphiques d'activité
- Chatbot pour demandes de films/séries (groupe séparé)
- Notification de nouvelle version disponible

## User Journeys

### Journey 1: Marie - Membre du groupe WhatsApp

**Persona:**
- **Nom:** Marie, 32 ans
- **Situation:** Amie de l'admin, a accès au serveur Jellyfin, aime les séries
- **But:** Être informée des nouveautés sans checker Jellyfin régulièrement

**Narrative Journey:**

**Opening Scene:** Marie est au travail. Son téléphone vibre - notification WhatsApp du groupe communautaire.

**Rising Action:** Elle voit le message avec une belle image de série :
```
📺 Nouveautés séries

The Last of Us (2023) S01E04-05
↳ Regarder
```

**Climax:** Elle clique sur "Regarder", l'app Jellyfin s'ouvre directement sur l'épisode. Elle se dit "ce soir, je mate ça !"

**Resolution:** Le soir, elle regarde les épisodes. Elle n'a rien eu à chercher, tout était prêt.

---

### Journey 2: Admin - Setup Initial

**Persona:**
- **Nom:** Mathieu (Admin)
- **Situation:** Propriétaire du serveur Jellyfin, veut partager ses contenus
- **But:** Que ça fonctionne sans intervention

**Narrative Journey:**

**Opening Scene:** L'admin vient d'ajouter des films à Jellyfin. Il veut que ses amis soient notifiés automatiquement.

**Rising Action:**
1. Lance le container Docker avec docker-compose
2. Reçoit un email avec un code de connexion WhatsApp
3. Entre le code sur son téléphone (WhatsApp > Appareils liés)
4. Configure le groupe cible dans l'UI admin

**Climax:** Première notification envoyée automatiquement dans le groupe. Ça marche !

**Resolution:** Pendant des semaines, l'admin n'y pense plus. Les notifications partent toutes seules.

---

### Journey 3: Admin - Gestion d'erreur (Session expirée)

**Persona:** Même admin

**Narrative Journey:**

**Opening Scene:** L'admin est en vacances. Son téléphone vibre - alerte Telegram : "WhatsApp déconnecté, code de reconnexion : 42-85-19-63"

**Rising Action:** Il ouvre WhatsApp sur son téléphone, va dans "Appareils liés", entre le code reçu.

**Climax:** Reconnexion réussie. Aucun accès à l'UI web nécessaire - juste le téléphone suffit.

**Resolution:** Les notifications en queue sont envoyées automatiquement. Rien n'a été perdu.

---

### Journey Requirements Summary

| Journey | Capabilities Required |
|---------|----------------------|
| Marie (membre) | Notifications WhatsApp avec images, liens deep-link vers app/webapp, agrégation intelligente des épisodes |
| Admin - Setup | Déploiement Docker simple, connexion WhatsApp par code notifié, UI de configuration basique, système d'alertes |
| Admin - Erreur | Alertes multi-canal (email/Telegram/Discord), reconnexion par code sans UI, queue persistante avec retry |

## Technical Requirements

### Project Type: API Backend + Web Application

**Backend (API Service):**
- Webhook receiver pour événements Jellyfin
- Service de connexion et envoi WhatsApp
- Queue de messages avec retry automatique
- Service de redirection (liens deep-link)
- Système d'alertes multi-canal

**Frontend (Admin UI):**
- Framework: Vue.js
- Configuration des groupes WhatsApp cibles
- Gestion de la connexion WhatsApp (affichage code/status)
- Configuration des alertes
- Visualisation du statut du service

### API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/webhook/jellyfin` | POST | Réception des événements Jellyfin |
| `/api/config` | GET/PUT | Configuration générale du service |
| `/api/whatsapp/status` | GET | Statut de connexion WhatsApp |
| `/api/whatsapp/connect` | POST | Déclenche la connexion WhatsApp |
| `/api/groups` | GET/POST/DELETE | Gestion des groupes WhatsApp cibles |
| `/api/queue` | GET | Visualisation de la queue de messages |
| `/redirect/:id` | GET | Redirection vers contenu Jellyfin |

### Data Schemas

**Configuration:**
- Jellyfin: URL du serveur, webhook secret
- WhatsApp: credentials session, groupes cibles
- Alertes: canaux configurés (email/Telegram/Discord), destinataires
- Agrégation: fenêtre temporelle, séparation films/séries

**Queue de messages:**
- ID, type (film/série), metadata média, status, retry count, timestamps

**Historique:**
- Messages envoyés, groupes destinataires, timestamps, status

### Implementation Considerations

- **Persistence:** JSON/SQLite (pas de DB externe requise)
- **WhatsApp Library:** whatsapp-web.js ou Baileys
- **Images:** Récupération covers TMDB/IMDB avec fallback Jellyfin
- **Deployment:** Docker avec Alpine/Slim images

## Risk Mitigation Strategy

**Technical Risks:**
- *Librairie WhatsApp instable* → Utiliser Baileys ou whatsapp-web.js, prévoir abstraction pour changer facilement
- *Session WhatsApp expire fréquemment* → Système de reconnexion par code notifié (innovation clé)

**Market Risks:**
- *WhatsApp bloque les comptes automatisés* → Usage personnel/communautaire uniquement (pas d'envoi massif), respect des rate limits

**Resource Risks:**
- *Moins de temps que prévu* → Le MVP peut fonctionner sans UI admin sophistiquée (config par fichier), l'UI peut venir après

## Functional Requirements

### Media Event Reception

- FR1: System can receive webhook events from Jellyfin for media additions
- FR2: System can receive webhook events from Jellyfin for media deletions
- FR3: System can validate incoming webhooks using a shared secret
- FR4: System can extract media metadata (title, year, type, cover URL, Jellyfin ID) from webhook payload

### WhatsApp Integration

- FR5: Admin can connect the service to WhatsApp using a pairing code
- FR6: System can send text messages to a configured WhatsApp group
- FR7: System can send images with captions to a configured WhatsApp group
- FR8: Admin can view the current WhatsApp connection status
- FR9: System can automatically detect WhatsApp disconnection
- FR10: System can generate a new pairing code when reconnection is needed

### Message Aggregation

- FR11: System can aggregate multiple media additions into a single notification
- FR12: System can separate film aggregation from series aggregation
- FR13: Admin can configure the aggregation time window
- FR14: System can format aggregated notifications with cover image, titles, and years

### Content Links & Redirection

- FR15: System can generate unique redirect links for each notified media
- FR16: User can access Jellyfin content via redirect link (web or app deep-link)
- FR17: System can include clickable links in WhatsApp messages

### Admin Configuration

- FR18: Admin can configure the target WhatsApp group
- FR19: Admin can configure Jellyfin server URL
- FR20: Admin can configure alert notification channels (email/Telegram/Discord)
- FR21: Admin can view service status and configuration via web UI

### System Alerts

- FR22: System can send alerts when WhatsApp connection is lost
- FR23: System can include reconnection code in alert messages
- FR24: Admin can receive alerts via email
- FR25: Admin can receive alerts via Telegram
- FR26: Admin can receive alerts via Discord

### Resilience & Message Queue

- FR27: System can persist pending messages to survive restarts
- FR28: System can retry failed message deliveries automatically
- FR29: System can process queued messages when WhatsApp reconnects
- FR30: Admin can view pending messages in the queue

## Non-Functional Requirements

### Performance

- NFR1: Service consumes less than 100MB RAM in idle state
- NFR2: Service consumes less than 5% CPU in idle state
- NFR3: Webhook processing completes within 500ms of receipt
- NFR4: Aggregation window timer accuracy within 1 second
- NFR5: Docker image size under 200MB

### Security

- NFR6: Webhook requests are validated using shared secret before processing
- NFR7: WhatsApp session credentials are stored locally only (not transmitted externally)
- NFR8: Admin UI is accessible only on configured network (localhost by default)
- NFR9: No sensitive data (credentials, tokens) is logged

### Integration

- NFR10: Service operates normally when TMDB/IMDB APIs are unavailable (graceful degradation)
- NFR11: Service supports Jellyfin webhook format without modification
- NFR12: Alert channels (email/Telegram/Discord) operate independently (one failure doesn't block others)
- NFR13: WhatsApp library can be swapped without major refactoring (abstraction layer)

### Reliability

- NFR14: Service uptime target of 99.9% (excluding planned maintenance)
- NFR15: No message loss during service restart (queue persistence)
- NFR16: Automatic WhatsApp reconnection attempt within 60 seconds of disconnection detection
- NFR17: Failed messages retry up to 5 times with exponential backoff
- NFR18: Service starts and accepts webhooks within 30 seconds of container launch

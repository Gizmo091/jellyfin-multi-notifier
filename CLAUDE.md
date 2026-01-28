# Instructions pour Claude

## Règles de maintenance du projet

### .gitignore
- Mettre à jour le fichier `.gitignore` au fur et à mesure du développement
- Exclure les fichiers des IDE courants (VSCode, IntelliJ, etc.)
- Exclure les fichiers spécifiques aux OS (macOS, Windows, Linux)

### README.md
- Maintenir le fichier `README.md` à jour en permanence
- Documenter les nouvelles fonctionnalités ajoutées
- Mettre à jour les instructions d'installation et d'utilisation si nécessaire

### Versioning et Tags Git
Après un commit significatif, créer un tag git en suivant le Semantic Versioning :

**Format** : `vMAJOR.MINOR.PATCH` (ex: v1.2.3)

**Règles d'incrémentation** :
- **MAJOR** (v2.0.0) : Changements breaking (API incompatible, restructuration majeure)
- **MINOR** (v1.1.0) : Nouvelles fonctionnalités rétro-compatibles
- **PATCH** (v1.0.1) : Corrections de bugs, améliorations mineures

**Quand créer un tag** :
- Après l'ajout d'une nouvelle fonctionnalité significative
- Après une série de corrections de bugs
- Quand l'utilisateur demande une release
- Quand le code est stable et prêt pour production

**Commandes** :
```bash
git tag v1.0.0
git push --tags
```

**Note** : Vérifier le dernier tag existant avec `git tag --sort=-v:refname | head -5` avant de créer un nouveau tag.
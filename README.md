# Le Feuilleton — chapitres diffusés par QR code

Une petite app web (installable comme une PWA) : côté lecteur, un QR code renvoie
toujours vers le dernier chapitre publié. Côté admin (`/admin.html`), tu publies un
titre + un chapitre (+ une image facultative) quand tu veux, tu peux modifier ou
supprimer un chapitre déjà publié, et l'historique des chapitres précédents reste
consultable.

Les données (chapitres, réglages, images) sont stockées dans une base **Postgres**
(par exemple gratuite chez Supabase) plutôt que sur le disque du serveur — ce qui
est nécessaire sur Render, dont le disque gratuit est effacé à chaque redémarrage
du service (y compris après une mise en veille automatique pour inactivité).

## Démarrer en local

```bash
npm install
cp .env.example .env   # renseigne ADMIN_PASSWORD et DATABASE_URL dans .env
npm start
```

Ouvre `http://localhost:3000` (lecteur) et `http://localhost:3000/admin.html` (admin).
Au premier démarrage, les tables nécessaires sont créées automatiquement dans ta
base, avec un chapitre d'exemple.

## Créer la base (Supabase, gratuit)

1. Va sur [supabase.com](https://supabase.com) → **New project**. Choisis un nom,
   une région, un mot de passe pour la base (note-le).
2. Une fois le projet créé : bouton **Connect** (ou *Project Settings → Database*)
   → section **Connection string** → onglet **URI**, mode **Session pooler**.
3. Copie cette chaîne et remplace `[YOUR-PASSWORD]` par le mot de passe choisi à
   l'étape 1. C'est la valeur de `DATABASE_URL`.

## Déployer sur onrender.com

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur Render : **New +** → **Web Service** → connecte le dépôt.
3. Réglages :
   - **Build command** : `npm install`
   - **Start command** : `npm start`
4. Dans **Environment**, ajoute :
   - `ADMIN_PASSWORD` — ton propre mot de passe admin (jamais la valeur par défaut
     `changemoi` en production) ;
   - `DATABASE_URL` — la chaîne de connexion Supabase de l'étape précédente.
5. Déploie. L'URL fournie par Render (ex. `https://ton-feuilleton.onrender.com`)
   est celle à encoder dans ton QR code — elle affiche toujours automatiquement
   le dernier chapitre publié, sans jamais avoir besoin d'être changée.

Comme les données vivent maintenant dans Supabase et non sur le disque de Render,
elles survivent aux redémarrages et mises en veille du plan gratuit — le plan
gratuit Render convient donc très bien pour cet usage.

### Limite à connaître

Les images sont stockées directement en base (encodées, jusqu'à 3 Mo par image),
ce qui évite toute dépendance à un espace de stockage de fichiers séparé. Pour un
feuilleton perso avec des illustrations occasionnelles, c'est largement suffisant ;
si tu publies un jour énormément d'images en haute résolution, il vaudra mieux
migrer vers un stockage d'objets dédié (Supabase Storage, S3...).

## Personnaliser

- **Nom de l'appli / de l'onglet** : `public/manifest.json` (`name`, `short_name`)
  et la balise `<title>` de `public/index.html`.
- **Titre du livre et synopsis** : modifiables directement depuis `/admin.html`.
- **Auteur par défaut** : déjà réglé sur *Blaise BAZINGA*, modifiable dans le
  formulaire admin à chaque publication, ou dans `DEFAULT_AUTHOR` (`db.js`).
- **Palette / typographies** : variables CSS en haut de `public/css/style.css`.
- **Icône** : `public/icon.svg`.

## Comment ça marche pour les lecteurs

- Ils scannent le QR code → ils arrivent sur le dernier chapitre publié.
- Un chapitre trop long est automatiquement découpé en plusieurs pages
  (flèche en bas pour tourner la page), avec la signature de l'auteur en bas
  de la dernière page.
- **« Chapitre précédent »** remonte d'un cran dans le temps ; **« Tous les
  chapitres »** ouvre la liste complète avec les dates de diffusion ;
  **« Revenir au dernier »** réapparaît dès qu'on consulte une archive.
- **« Inviter un lecteur »** partage (ou copie) le lien vers ce qui est
  actuellement affiché, via le partage natif du téléphone si disponible.

## Publier, modifier ou supprimer un chapitre

Va sur `/admin.html`, entre ton mot de passe.
- **Publier** : remplis titre + texte (les paragraphes séparés par une ligne vide
  deviennent des paragraphes distincts), ajoute une ou plusieurs photos si tu veux,
  et publie. Le chapitre devient immédiatement celui affiché par défaut.
- **Placer une photo précisément** : tape `[image]` sur sa propre ligne, à l'endroit
  du texte où tu veux qu'elle apparaisse. Les photos sont utilisées dans l'ordre où
  tu les ajoutes — la 1ère au 1er `[image]`, la 2e au 2e, etc. Une photo ajoutée sans
  `[image]` correspondant s'affiche automatiquement à la fin du chapitre. Sans aucun
  `[image]` dans le texte, la première photo s'affiche en tête (comportement par
  défaut) et les suivantes en fin de chapitre.
- **Modifier** : clique sur « Modifier » à côté d'un chapitre de la liste — le
  formulaire se pré-remplit. Tu peux ajouter de nouvelles photos, ou retirer
  individuellement une photo existante (bouton × sur sa vignette).
- **Supprimer** (publication par erreur) : clique sur « Supprimer » à côté du
  chapitre concerné, après confirmation.

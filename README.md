# Binôme :
- BACHA Hiba
- EL JAGHAOUI Abdelhafid

# Pour lancer notre Sampler :
- Aller dans le dossier le dossier : `M1InfoWebTechnos2025_2026/Seance2/ExampleRESTEndPointCorrige` sur le Terminal
- Lancer la commande `npm run start`
- Puis, depuis `index.html`, du dossier `M1InfoWebTechnos2025_2026/Seance4_IntroWebAudio/Example5` faire un clic droit -> `Open with Live Server`

# Contexte du projet
Ce projet a été réalisé dans le cadre du module Web (M1 Informatique) coordonnée par M.Buffa.
L’objectif était de manipuler le **Web Audio API** pour créer un sampler audio fonctionnel et interactif.

# Travail effectué :
Notre travail se trouve dans le dossier `M1InfoWebTechnos2025_2026/Seance4_IntroWebAudio/Example5/js`

Ce projet consiste en la réalisation d’un sampler audio en JavaScript, permettant de charger, lire, visualiser et manipuler des sons via une interface graphique web.
L’application s’appuie sur le Web Audio API pour le traitement du son et sur le Canvas API pour l’affichage des formes d’onde.

# Structure du projet
```
└── Example5/
      ├── index.html
      ├── styles.css
      └── js/
           ├── main.js
           ├── SamplerEngine.js
           ├── SamplerGUI.js
           ├── WaveformCanvas.js
           └── PresetService.js
```


# Fonctionnalités principales
- Lecture, pause et arrêt de sons chargés.
- Visualisation de la forme d’onde du son.
- Découpe de sons via une trimbar pour sélectionner et isoler une portion spécifique du son.
- Gestion d’une liste d’enregistrements :
  - Ajout d’un enregistrement après capture.  
  - Suppression d’un enregistrement depuis la liste.  
  - Exportation et téléchargement d’un enregistrement en `.wav`.

# Description des fichiers
- **`js/main.js`**  
  Point d’entrée du projet. Initialise les différents modules et gère la coordination entre l’interface, le moteur audio et les presets.

- **`js/SamplerEngine.js`**  
  Moteur audio principal. Gère le chargement, la lecture, la découpe et l’enregistrement des sons via le Web Audio API.

- **`js/SamplerGUI.js`**  
  Interface utilisateur du sampler. Relie les actions de l’utilisateur au moteur audio : lecture, enregistrement, gestion des pads et export `.wav`.

- **`js/WaveformCanvas.js`**  
  Affiche la forme d’onde du son sur un canvas et permet la découpe via les trimbars.

- **`js/PresetService.js`**  
  Communique avec une API externe pour charger les presets disponibles et formater les données pour le sampler.

# Aperçu

# Technologies utilisées
- JavaScript
- Web Audio API
- Canvas API
- HTML5 / CSS3
- Node.js (serveur API pour les presets)

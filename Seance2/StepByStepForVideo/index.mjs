import express from "express";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import cors from "cors"; 

const app = express();

// Static files are located in the public folder
const __filename = fileURLToPath(import.meta.url);
console.log("import.meta.url = " + import.meta.url)
console.log("__filename = " + __filename);
const __dirname = path.dirname(__filename);
console.log("__dirname = " + __dirname);

// PUBLIC_DIR: env var wins, else ../public (absolute path)
// --------- Cross-platform paths (Mac/Linux/Windows) ---------

export const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.resolve(__dirname, "public");

  console.log("PUBLIC_DIR = " + PUBLIC_DIR);

// DATA_DIR: env var wins, else <PUBLIC_DIR>/presets
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PUBLIC_DIR, "presets");

  console.log("DATA_DIR = " + DATA_DIR)

// Activation de CORS 
app.use(cors()); 

// CHANGEMENT CRUCIAL : On sert le sous-dossier 'presets' qui contient les kits.
// Express va chercher dans PUBLIC_DIR/presets, mais les URLs dans le navigateur 
// n'auront pas besoin du /presets.

// express.static(chemin, { options })
app.use(express.static(PUBLIC_DIR)); // Pour servir le reste du dossier public

// Cette ligne ajoute une nouvelle racine pour les fichiers. 
// Quand le navigateur demande /808/kick.wav, Express cherche dans le dossier data/presets.
// Si le dossier 'presets' contient les sous-dossiers '808', 'basic-kit', etc.
// ET que 'DATA_DIR' pointe vers ce dossier :
app.use(express.static(DATA_DIR)); // <--- NOUVEAU: Ajoute le dossier 'presets' comme racine statique

// let's define a route for the preset files
app.get("/api/presets", async (req, res) => {
// ... (le reste de la fonction est inchangé, elle est correcte)
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => file.endsWith(".json"));

    let promiseArray = [];

    for (let i = 0; i < jsonFiles.length; i++) {
        const filePath = path.join(DATA_DIR, jsonFiles[i]);
        const promise = JSON.parse(await fs.readFile(filePath, "utf8"))
        promiseArray.push(promise);
    }

    const result = await Promise.all(promiseArray);
    res.json(result);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
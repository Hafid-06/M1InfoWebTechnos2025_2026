// src/app.mjs — corrigé complet et fonctionnel
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import crypto from "crypto";
import multer from "multer";
import cors from "cors"; // ✅ import cors avant utilisation

// import utility functions
import {
  slugify, safePresetPath, fileExists,
  readJSON, writeJSON, listPresetFiles, validatePreset
} from "./utils.mjs";

// --------- Création de l'app Express ---------
export const app = express();
app.use(cors()); // ✅ on peut maintenant l'utiliser
app.use(express.json({ limit: "2mb" }));

// --------- Cross-platform paths ---------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// PUBLIC_DIR: env var wins, else ../public (absolute path)
export const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.resolve(__dirname, "../public");

// DATA_DIR: env var wins, else <PUBLIC_DIR>/presets
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PUBLIC_DIR, "presets");

// --------- Multer config pour upload ---------
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const folder = req.params.folder || "";
      const destDir = path.join(DATA_DIR, folder);
      await fs.mkdir(destDir, { recursive: true }).catch(() => {});
      cb(null, destDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// --------- Servir les fichiers statiques ---------
app.use(express.static(PUBLIC_DIR));

// S'assurer que le dossier data existe
await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

// --------- Routes ---------

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// GET list/search
app.get("/api/presets", async (req, res, next) => {
  try {
    const { q, type, factory } = req.query;
    const files = await listPresetFiles();
    let items = await Promise.all(files.map((f) => readJSON(path.join(DATA_DIR, f))));

    if (type) items = items.filter((p) => p?.type?.toLowerCase() === String(type).toLowerCase());
    if (factory !== undefined) {
      const want = String(factory) === "true";
      items = items.filter((p) => Boolean(p?.isFactoryPresets) === want);
    }
    if (q) {
      const needle = String(q).toLowerCase();
      items = items.filter((p) => {
        const inName = p?.name?.toLowerCase().includes(needle);
        const inSamples = Array.isArray(p?.samples) &&
          p.samples.some((s) =>
            s && (s.name?.toLowerCase().includes(needle) || s.url?.toLowerCase().includes(needle))
          );
        return inName || inSamples;
      });
    }

    res.json(items);
  } catch (e) { next(e); }
});

// GET un preset
app.get("/api/presets/:name", async (req, res, next) => {
  try {
    const file = safePresetPath(req.params.name);
    if (!(await fileExists(file))) return res.status(404).json({ error: "Preset not found" });
    res.json(await readJSON(file));
  } catch (e) { next(e); }
});

// POST nouveau preset
app.post("/api/presets", async (req, res, next) => {
  try {
    const preset = req.body ?? {};
    const errs = validatePreset(preset);
    if (errs.length) return res.status(400).json({ errors: errs });

    const file = safePresetPath(preset.name);
    if (await fileExists(file))
      return res.status(409).json({ error: "A preset with this name already exists" });

    const now = new Date().toISOString();
    const withMeta = {
      id: preset.id || crypto.randomUUID(),
      slug: slugify(preset.name),
      updatedAt: now,
      ...preset,
      name: preset.name,
    };
    await writeJSON(file, withMeta);
    res.status(201).json(withMeta);
  } catch (e) { next(e); }
});

// POST upload fichiers audio
app.post("/api/upload/:folder", upload.array("files", 16), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "No files uploaded" });

  const infos = req.files.map((f) => ({
    originalName: f.originalname,
    storedName: f.filename,
    size: f.size,
    url: `/presets/${req.params.folder}/${f.filename}`
  }));

  res.status(201).json({ uploaded: infos.length, files: infos });
});

// PUT remplacer un preset
app.put("/api/presets/:name", async (req, res, next) => {
  try {
    const oldFile = safePresetPath(req.params.name);
    if (!(await fileExists(oldFile))) return res.status(404).json({ error: "Preset not found" });

    const preset = req.body ?? {};
    const errs = validatePreset(preset);
    if (errs.length) return res.status(400).json({ errors: errs });

    const now = new Date().toISOString();
    const newFile = safePresetPath(preset.name);
    const current = await readJSON(oldFile).catch(() => ({}));
    const withMeta = {
      id: current.id || preset.id || crypto.randomUUID(),
      slug: slugify(preset.name),
      updatedAt: now,
      ...preset,
      name: preset.name,
    };
    await writeJSON(newFile, withMeta);
    if (newFile != oldFile) await fs.rm(oldFile, { force: true });
    res.json(withMeta);
  } catch (e) { next(e); }
});

// PATCH partiel
app.patch("/api/presets/:name", async (req, res, next) => {
  try {
    const oldFile = safePresetPath(req.params.name);
    if (!(await fileExists(oldFile))) return res.status(404).json({ error: "Preset not found" });

    const current = await readJSON(oldFile);
    const merged = { ...current, ...req.body };
    merged.name = merged.name ?? current.name;
    const errs = validatePreset(merged, { partial: true });
    if (errs.length) return res.status(400).json({ errors: errs });

    merged.slug = slugify(merged.name);
    merged.updatedAt = new Date().toISOString();

    const newFile = safePresetPath(merged.name);
    await writeJSON(newFile, merged);
    if (newFile != oldFile) await fs.rm(oldFile, { force: true });

    res.json(merged);
  } catch (e) { next(e); }
});

// DELETE preset
app.delete("/api/presets/:name", async (req, res, next) => {
  try {
    const file = safePresetPath(req.params.name);
    await fs.rm(file, { force: true });

    const folderPath = path.join(DATA_DIR, req.params.name);
    await fs.rm(folderPath, { recursive: true, force: true }).catch(() => {});
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST seeding
app.post("/api/presets:seed", async (req, res, next) => {
  try {
    const arr = Array.isArray(req.body) ? req.body : null;
    if (!arr) return res.status(400).json({ error: "Body must be an array of presets" });

    let created = 0; const slugs = [];
    for (const p of arr) {
      const errs = validatePreset(p);
      if (errs.length) return res.status(400).json({ errors: errs });
      const now = new Date().toISOString();
      const withMeta = { id: p.id || crypto.randomUUID(), slug: slugify(p.name), updatedAt: now, ...p, name: p.name };
      await writeJSON(safePresetPath(p.name), withMeta);
      created++; slugs.push(withMeta.slug);
    }
    res.status(201).json({ created, slugs });
  } catch (e) { next(e); }
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

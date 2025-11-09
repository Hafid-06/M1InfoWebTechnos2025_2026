// Seance4_IntroWebAudio/Example5/js/PresetService.js

// Base de l'API : si la variable globale n'existe pas, on suppose même origine
const API_BASE = (typeof window !== "undefined" && window.PRESETS_API_BASE) || "";
const API_PRESETS = `${API_BASE}/api/presets`;

// Convertit un chemin renvoyé par l'API en URL absolue utilisable par <audio> / fetch
function toAbsolute(urlLike) {
  // si c'est déjà absolu (http/https), on garde
  if (/^https?:\/\//i.test(urlLike)) return urlLike;

  // cas des fichiers audio : l'endpoint sert les assets sous /presets/<path>
  // ex: sample.url = "lofi/kick.wav"  ->  http://localhost:3000/presets/lofi/kick.wav
  // ex: sample.url = "/presets/lofi/kick.wav" -> http://localhost:3000/presets/lofi/kick.wav
  if (urlLike.startsWith("/presets/")) return `${API_BASE}${urlLike}`;
  return `${API_BASE}/presets/${urlLike.replace(/^\/+/, "")}`;
}

// Normalise la réponse de l’API vers le format attendu par main.js : { name, files[] }
function normalizePresets(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((p, i) => ({
      name: p?.name || `Preset ${i + 1}`,
      // l’API Corrigée renvoie p.samples = [{ name, url }]
      files: Array.isArray(p?.samples) ? p.samples.filter(Boolean).map(s => toAbsolute(s.url)) : []
    }))
    .filter(p => p.files.length > 0);
}

export const PresetService = {
  async fetchPresets() {
    const res = await fetch(API_PRESETS, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${API_PRESETS}`);
    const json = await res.json();
    return normalizePresets(json);
  }
};

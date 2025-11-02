// js/main.js
// Crée plusieurs boutons : un par échantillon. Chaque bouton joue son propre son.

import { loadAndDecodeSound, playSound } from "./soundutils.js";

let ctx;

// Liste des sons
const soundURLs = [
  "https://upload.wikimedia.org/wikipedia/commons/a/a3/Hardstyle_kick.wav",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c7/Redoblante_de_marcha.ogg/Redoblante_de_marcha.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c9/Hi-Hat_Cerrado.ogg/Hi-Hat_Cerrado.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/0/07/Hi-Hat_Abierto.ogg/Hi-Hat_Abierto.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3c/Tom_Agudo.ogg/Tom_Agudo.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a4/Tom_Medio.ogg/Tom_Medio.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8d/Tom_Grave.ogg/Tom_Grave.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/68/Crash.ogg/Crash.ogg.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Ride.ogg/Ride.ogg.mp3",
];

// On garde les buffers réussis pour jouer à la volée
let decoded = []; // [{ url, buffer }...]

// Récupère un nom court lisible depuis l'URL
function shortNameFrom(url) {
  const last = url.split("/").pop() || url;
  return last.replace(/\.(wav|mp3|ogg)$/i, "");
}

// Crée un conteneur si absent
function ensureContainer() {
  let box = document.querySelector("#multi-buttons");
  if (!box) {
    box = document.createElement("div");
    box.id = "multi-buttons";
    box.style.display = "grid";
    box.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
    box.style.gap = "8px";
    box.style.marginTop = "12px";
    document.body.appendChild(box);
  }
  return box;
}

window.addEventListener("load", async () => {
  // 1) AudioContext
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // 2) On désactive/repurpose le bouton existant de ton HTML
  const mainBtn = document.querySelector("#playButton");
  if (mainBtn) {
    mainBtn.disabled = true;
    mainBtn.textContent = "Chargement des sons…";
  }

  // 3) Charge/décode tous les sons en parallèle
  const results = await Promise.allSettled(
    soundURLs.map((url) => loadAndDecodeSound(url, ctx))
  );

  // 4) Construit les boutons (un par URL)
  const container = ensureContainer();

  results.forEach((res, i) => {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "stretch";

    const btn = document.createElement("button");
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "8px";
    btn.style.border = "1px solid #ccc";
    btn.style.cursor = "pointer";

    const label = document.createElement("small");
    label.style.opacity = "0.75";
    label.style.marginTop = "4px";
    label.textContent = shortNameFrom(soundURLs[i]);

    if (res.status === "fulfilled") {
      const buffer = res.value;
      decoded.push({ url: soundURLs[i], buffer });
      btn.textContent = "PLAY";
      btn.disabled = false;

      btn.addEventListener("click", async () => {
        if (ctx.state === "suspended") {
          try { await ctx.resume(); } catch {}
        }
        playSound(ctx, buffer, 0, buffer.duration);
      });
    } else {
      btn.textContent = "FAILED";
      btn.disabled = true;
      btn.title = res.reason?.message ?? "Failed to load/decode";
    }

    wrapper.appendChild(btn);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });

  // 5) Met à jour le bouton d’origine pour info
  if (mainBtn) {
    const ok = decoded.length;
    if (ok > 0) {
      mainBtn.textContent = `✅ ${ok}/${results.length} sons prêts — utilisez les boutons ci-dessous`;
    } else {
      mainBtn.textContent = "❌ Aucun son chargé (voir console)";
    }
  }
});

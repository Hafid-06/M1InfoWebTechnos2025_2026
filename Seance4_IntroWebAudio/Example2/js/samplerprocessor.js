// samplerprocessor.js
import { loadAndDecodeSound, playSound } from './soundutils.js';
import { pixelToSeconds } from './utils.js';

// ====================== Config ======================
const API_BASE_URL = 'http://localhost:3000';

// ====================== Small class per sound ======================
class SoundItem {
    constructor(url, buffer) {
        this.url = url;
        this.buffer = buffer;
        this.leftRatio = 0;
        this.rightRatio = 1;
        this.button = null; // Référence au bouton de la GUI
    }

    getPlayRangeSeconds(canvasWidth, leftTrimBarX, rightTrimBarX) {
        const duration = this.buffer.duration;
        // pixelToSeconds est utilisé ici en tant que helper public
        const start = pixelToSeconds(leftTrimBarX, duration, canvasWidth);
        const end   = pixelToSeconds(rightTrimBarX, duration, canvasWidth);
        return [start, end];
    }
}

// ====================== SamplerProcessor Class (The Engine) ======================
export default class SamplerProcessor {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = [];
        this.presets = [];
        this.currentIndex = -1;
        this.outputNode = this.ctx.destination; // Sortie par défaut
    }

    // Façade: Connecte le Sampler à un autre AudioNode (Design Pattern)
    connect(destinationNode) {
        // Dans ce cas simple, on pourrait se connecter à un gain ou un autre node si on le souhaitait.
        // Pour l'instant, le Sampler joue directement, mais on garde la méthode pour la structure.
        this.outputNode = destinationNode;
    }

    // Façade: Charge tous les presets depuis l'API
    async loadPresets() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/presets`);
            if (!response.ok) {
                throw new Error(`HTTP status: ${response.status}`);
            }
            this.presets = await response.json();
            return true; // Succès
        } catch (error) {
            console.error('Failed to load presets from API.', error.message);
            return false; // Échec
        }
    }

    // Façade: Charge un preset spécifique par son index
    async loadPreset(index) {
        const preset = this.presets[index];
        if (!preset) return false;

        // Réinitialisation de l'état
        this.sounds = [];
        this.currentIndex = -1;

        // Construction et encodage des URLs pour les fichiers statiques
        const soundURLs = preset.samples.map(sample => {
            let relativeUrl = sample.url;
            if (relativeUrl.startsWith('./')) {
                relativeUrl = relativeUrl.substring(2);
            } else if (relativeUrl.startsWith('/')) {
                relativeUrl = relativeUrl.substring(1);
            }
            const encodedRelativeUrl = encodeURI(relativeUrl);
            return `${API_BASE_URL}/${encodedRelativeUrl}`;
        });

        // Chargement/décodage en parallèle
        const results = await Promise.allSettled(
            soundURLs.map((url) => loadAndDecodeSound(url, this.ctx))
        );

        results.forEach((res, i) => {
            if (res.status === 'fulfilled') {
                this.sounds.push(new SoundItem(soundURLs[i], res.value));
            } else {
                console.warn('Failed to load sound:', soundURLs[i], res.reason);
            }
        });
        
        // Mettre à jour l'index sélectionné si des sons ont été chargés
        if (this.sounds.length > 0) {
            this.currentIndex = 0;
            return true;
        }

        return false;
    }

    // Façade: Joue le son sélectionné ou un son spécifique
    async playSound(index, start, end) {
        const s = this.sounds[index];
        if (!s) return;

        // Le Sampler WAM permet de s'assurer que le contexte n'est pas suspendu
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        // playSound utilise this.outputNode comme destination via buildAudioGraph dans soundutils.js
        // NOTE: playSound est importé de soundutils.js, qui gère la connexion à ctx.destination
        playSound(this.ctx, s.buffer, start, end);
    }

    // Méthodes pour l'état (utilisées par la GUI)
    getPresets() {
        return this.presets;
    }
    getSounds() {
        return this.sounds;
    }
    getCurrentSound() {
        return this.sounds[this.currentIndex];
    }
    setCurrentIndex(index) {
        this.currentIndex = index;
    }
}
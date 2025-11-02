// main.js
// La logique a été déplacée vers samplerprocessor.js et samplergui.js

import SamplerProcessor from './samplerprocessor.js';
import SamplerGUI from './samplergui.js';

// ====================== Init ======================
window.onload = async function init() {
    // 1. Initialisation du Moteur Audio (Processor)
    const processor = new SamplerProcessor();
    processor.connect(processor.ctx.destination); // Connexion à la sortie audio

    // 2. Initialisation de la GUI (View)
    const gui = new SamplerGUI(
        processor, 
        '#myCanvas', 
        '#myCanvasOverlay', 
        '#playButton'
    );
    
    // 3. Charger les presets depuis l'API via le Processor
    const presetsLoaded = await processor.loadPresets();
    
    if (!presetsLoaded || processor.getPresets().length === 0) {
        gui.playButton.textContent = 'No presets or API error.';
        gui.setupTrimBarMouse(); // Nécessaire pour éviter que l'appli ne plante sans sons
        requestAnimationFrame(gui.animate.bind(gui));
        return;
    }

    // 4. Construire l'UI basée sur les données
    gui.buildPresetSelect();
    
    // 5. Charger le premier preset et initialiser l'affichage
    const success = await processor.loadPreset(0); 

    if (success) {
        gui.buildSoundButtons();
        gui.selectSound(0); // Va mettre à jour waveform, trims et boutons
    } else {
        gui.playButton.textContent = 'Error loading first preset sounds.';
    }
    
    // Note: L'animation et le mouse handling sont gérés par gui.setupUI()
};
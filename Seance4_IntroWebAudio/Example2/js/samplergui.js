// samplergui.js
import WaveformDrawer from './waveformdrawer.js';
import TrimbarsDrawer from './trimbarsdrawer.js';
import { distance } from './utils.js';

// ====================== SamplerGUI Class (The View) ======================
export default class SamplerGUI {
    constructor(processor, canvasId, canvasOverlayId, playButtonId) {
        this.processor = processor; // Référence au moteur audio (SamplerProcessor)
        
        // Éléments DOM
        this.canvas = document.querySelector(canvasId);
        this.canvasOverlay = document.querySelector(canvasOverlayId);
        this.playButton = document.querySelector(playButtonId);
        
        // Drawers
        this.waveformDrawer = new WaveformDrawer();
        this.trimbarsDrawer = new TrimbarsDrawer(this.canvasOverlay, 100, 200);
        this.mousePos = { x: 0, y: 0 };
        
        // Initialisation de l'UI
        this.setupUI();
    }
    
    // ====================== Initialisation & Actions ======================

    setupUI() {
        // Gestion de l'action du bouton Play Global
        this.playButton.onclick = () => {
            const s = this.processor.getCurrentSound();
            if (!s) return;
            
            // On récupère les trims actuels de l'UI
            const [start, end] = s.getPlayRangeSeconds(
                this.canvas.width, 
                this.trimbarsDrawer.leftTrimBar.x, 
                this.trimbarsDrawer.rightTrimBar.x
            );
            this.processor.playSound(this.processor.currentIndex, start, end);
        };
        
        this.setupTrimBarMouse();
        requestAnimationFrame(this.animate.bind(this));
    }

    // Gère la création du menu déroulant des presets
    buildPresetSelect() {
        const presets = this.processor.getPresets();
        if (presets.length === 0) return;

        const select = document.createElement('select');
        select.id = 'presetSelect';
        select.style.padding = '8px';
        select.style.marginBottom = '12px';
        select.style.display = 'block';
        select.title = 'Select an audio preset';

        presets.forEach((preset, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = preset.name;
            select.appendChild(option);
        });

        // Envoie la commande au Processor lorsqu'un preset est sélectionné
        select.addEventListener('change', async (event) => {
            const index = parseInt(event.target.value);
            // Sauvegarde des trims du son courant AVANT de charger le nouveau preset
            this.storeCurrentTrims(); 
            
            this.playButton.textContent = 'Loading preset...';
            this.playButton.disabled = true;

            const success = await this.processor.loadPreset(index);
            
            if (success) {
                this.buildSoundButtons(); // Reconstruire les pads
                this.selectSound(this.processor.currentIndex); // Sélectionner le premier
            } else {
                this.playButton.textContent = 'Error loading preset.';
            }
        });

        this.playButton.insertAdjacentElement('beforebegin', select);
    }
    
    // ====================== CONSTRUCTEUR D'INTERFACE (Grille de Pads) ======================

    // Crée les pads Sampler en grille 4x4
    buildSoundButtons() {
        const sounds = this.processor.getSounds();
        const container = this.ensureButtonsContainer();
        container.innerHTML = ''; // Nettoyer l'ancienne interface

        // Configuration de la grille (4 colonnes fixes)
        container.style.gridTemplateColumns = 'repeat(4, minmax(60px, 1fr))';
        container.style.gap = '10px'; 
        
        // La logique d'indexation MPC (bottom-to-top, left-to-right) n'est pas nécessaire
        // ici, on va simplement créer 16 emplacements et les remplir.
        const numPads = 16;
        const buttonElements = [];
        
        // Créer les 16 pads
        for (let i = 0; i < numPads; i++) {
            const soundIndex = i;
            const s = sounds[soundIndex]; // Peut être undefined si moins de 16 sons

            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.alignItems = 'center';

            const btn = document.createElement('button');
            btn.textContent = `${i + 1}`;
            btn.style.width = '60px';
            btn.style.height = '60px';
            btn.style.padding = '5px';
            btn.style.borderRadius = '8px';
            btn.style.border = '1px solid #ccc';
            btn.style.cursor = s ? 'pointer' : 'default';
            btn.style.opacity = s ? '1.0' : '0.4';
            btn.disabled = !s;
            btn.title = s ? shortName(s.url) : 'Empty Pad';

            // Si un son existe pour ce pad
            if (s) {
                s.button = btn; // Stocke la référence du bouton dans SoundItem
                
                btn.addEventListener('click', () => {
                    // Sauvegarde des trims du son courant AVANT de changer (si on sélectionne un autre son)
                    this.storeCurrentTrims();
                    
                    // Sélectionner ce son pour affichage
                    this.selectSound(soundIndex); 
                    
                    // Jouer le son. On réutilise les trims de l'UI, qui sont ceux du son sélectionné.
                    const [start, end] = s.getPlayRangeSeconds(
                        this.canvas.width, 
                        this.trimbarsDrawer.leftTrimBar.x, 
                        this.trimbarsDrawer.rightTrimBar.x
                    );
                    this.processor.playSound(soundIndex, start, end);
                });
            }

            const label = document.createElement('small');
            label.style.opacity = '0.75';
            label.style.marginTop = '2px';
            label.textContent = s ? shortName(s.url) : '-';

            wrap.appendChild(btn);
            wrap.appendChild(label);
            container.appendChild(wrap);
            buttonElements.push(btn);
        }
    }

    // Met à jour l'affichage pour le son sélectionné (Waveform, Trimbars, couleur des pads)
    selectSound(index) {
        // Envoie la commande au Processor pour mettre à jour l'index
        this.processor.setCurrentIndex(index); 
        
        const s = this.processor.getCurrentSound();
        if (!s) return; // Ne rien faire si l'index pointe sur un pad vide (ne devrait pas arriver ici)

        // Synchro largeur « vraie » du canvas
        if (this.canvas.clientWidth && this.canvas.width !== this.canvas.clientWidth) {
            this.canvas.width = this.canvas.clientWidth;
            this.canvasOverlay.width = this.canvas.clientWidth;
        }

        const color = index % 2 === 0 ? '#83E83E' : '#58C5FF';

        // Dessine la waveform du son sélectionné
        this.waveformDrawer.init(s.buffer, this.canvas, color);
        this.waveformDrawer.drawWave(0, this.canvas.height);

        // Restaure ses trims mémorisés
        this.restoreTrimsFromSound(s);

        // Feedback visuel sur les boutons/pads
        this.processor.getSounds().forEach((item, i) => {
            if (!item.button) return;
            // Met en vert le pad sélectionné pour l'édition de la waveform/trims
            item.button.style.background = i === index ? '#4CAF50' : ''; 
        });
        
        this.playButton.disabled = false;
        this.playButton.style.background = '#e6ffe6'; // Petit feedback pour le bouton global
    }
    
    // ====================== Trims Handling ======================

    storeCurrentTrims() {
        const s = this.processor.getCurrentSound();
        if (!s) return;
        
        // Stocke les positions des trimbars sous forme de ratio 0..1
        const w = this.canvas.width;
        s.leftRatio = Math.max(0, Math.min(1, this.trimbarsDrawer.leftTrimBar.x / w));
        s.rightRatio = Math.max(0, Math.min(1, this.trimbarsDrawer.rightTrimBar.x / w));
    }
    
    restoreTrimsFromSound(s) {
        const w = this.canvas.width;
        // Applique les ratios stockés à la position en pixels de la barre
        this.trimbarsDrawer.leftTrimBar.x = Math.round(s.leftRatio * w);
        this.trimbarsDrawer.rightTrimBar.x = Math.round(s.rightRatio * w);
    }
    
    // Gère les événements souris pour les trims
    setupTrimBarMouse() {
        this.canvasOverlay.onmousemove = (evt) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (evt.clientX - rect.left);
            this.mousePos.y = (evt.clientY - rect.top);
            this.trimbarsDrawer.moveTrimBars(this.mousePos);
        };

        this.canvasOverlay.onmousedown = () => {
            this.trimbarsDrawer.startDrag();
        };

        this.canvasOverlay.onmouseup = () => {
            this.trimbarsDrawer.stopDrag();
            // Mémorise les trims du son en cours dès que le drag s'arrête
            this.storeCurrentTrims();
        };
    }

    // ====================== Animation ======================
    animate() {
        this.trimbarsDrawer.clear();
        this.trimbarsDrawer.draw();
        requestAnimationFrame(this.animate.bind(this));
    }
    
    // ====================== Helpers UI ======================
    ensureButtonsContainer() {
        let box = document.querySelector('#multi-buttons');
        if (!box) {
            box = document.createElement('div');
            box.id = 'multi-buttons';
            box.style.display = 'grid';
            box.style.gap = '10px';
            box.style.marginTop = '12px';
            this.playButton.insertAdjacentElement('afterend', box);
        }
        return box;
    }
}
// Helper function moved from main.js (non-class related)
function shortName(url) {
  const last = url.split('/').pop() || url;
  return decodeURIComponent(last);
}
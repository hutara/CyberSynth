/**
 * Main class for CyberSynth Strudel, managing sequencer, code editor, synth controls, and patterns.
 * @class
 */
class CyberStrudel {
    constructor() {
        this.currentPattern = null;
        this.isPlaying = false;
        this.sequencerState = {
            bd: Array(8).fill(false),
            sd: Array(8).fill(false),
            hh: Array(8).fill(false),
            cp: Array(8).fill(false)
        };
        this.trackStates = {
            bd: { muted: false, solo: false, steps: 8, sound: 'bd' },
            sd: { muted: false, solo: false, steps: 8, sound: 'sd' },
            hh: { muted: false, solo: false, steps: 8, sound: 'hh' },
            cp: { muted: false, solo: false, steps: 8, sound: 'cp' }
        };
        this.synthParams = {
            lpf: 800,
            lpq: 1,
            room: 0.5,
            delay: 0.3,
            bpm: 120,
            bpmEnabled: true
        };
        // MIDI runtime state
        this.midiAccess = null;
        this.midiOutputs = [];
        this.midiOutput = null; // selected MIDIOutput
        this.midiEnabled = false;
        this.mixedPatterns = {
            presets: {},
            tracks: {},
            saved: {} // Initialize saved patterns
        };
        this.savedPatterns = new Map();
        this.strudelReady = false;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        this.strudelAPI = null;
        this.init();
    }

    getTracks() {
        return Object.keys(this.sequencerState);
    }

    async init() {
        try {
            await this.initStrudel();
            this.strudelReady = true;
            this.setupSequencer();
            this.setupEventListeners();
            this.loadSavedData();
            this.saveToHistory();
            this.showNotification('CyberSynth Strudel initialized!', 'success');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification('Failed to initialize. Check console for details.', 'error');
        }
    }

    async initStrudel() {
        try {
            const { initStrudel, samples, setCps } = window.strudel;
            this.strudelAPI = window.strudel;
            await initStrudel({
                prebake: async () => {
                    try {
                        await samples('github:tidalcycles/dirt-samples');
                    } catch (error) {
                        console.warn('Could not load default samples:', error);
                    }
                }
            });
            if (setCps) {
                setCps(this.synthParams.bpm / 60 / 4);
            }
        } catch (error) {
            throw new Error('Strudel initialization failed: ' + error.message);
        }
    }

    saveToHistory() {
        const state = JSON.parse(JSON.stringify({
            sequencerState: this.sequencerState,
            trackStates: this.trackStates,
            code: document.getElementById('code-editor')?.value || '',
            mixedPatterns: this.mixedPatterns,
            synthParams: this.synthParams
        }));
        if (this.historyIndex < this.history.length - 1) {
            this.history.splice(this.historyIndex + 1);
        }
        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    undo() {
        if (this.historyIndex <= 0) {
            this.showNotification('Nothing to undo', 'error');
            return;
        }
        this.historyIndex--;
        this.restoreState(this.history[this.historyIndex]);
        this.showNotification('Undo successful', 'success');
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            this.showNotification('Nothing to redo', 'error');
            return;
        }
        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
        this.showNotification('Redo successful', 'success');
    }

    restoreState(state) {
        this.sequencerState = JSON.parse(JSON.stringify(state.sequencerState));
        this.trackStates = JSON.parse(JSON.stringify(state.trackStates));
        this.mixedPatterns = JSON.parse(JSON.stringify(state.mixedPatterns || { presets: {}, tracks: {}, saved: {} }));
        this.synthParams = JSON.parse(JSON.stringify(state.synthParams));
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = state.code || '';
        const originalTracks = ['bd', 'sd', 'hh', 'cp'];
        const currentTracks = this.getTracks();
        const missingTracks = currentTracks.filter(t => !document.getElementById(`${t}-track`));
        const extraEls = Array.from(document.querySelectorAll('.track-container[id$="-track"]') || [])
            .map(el => el.id.replace('-track', ''))
            .filter(id => !currentTracks.includes(id));
        if (missingTracks.length > 0 || extraEls.length > 0) {
            this.recreateSequencer();
        } else {
            this.getTracks().forEach(track => {
                const stepsEl = document.getElementById(`${track}-steps`);
                if (stepsEl) stepsEl.value = this.trackStates[track].steps;
                const soundEl = document.getElementById(`${track}-sound`);
                if (soundEl) soundEl.value = this.trackStates[track].sound;
                this.updateSequencerUI(track);
                const muteBtn = document.getElementById(`mute-${track}`);
                if (muteBtn) {
                    muteBtn.classList.toggle('active', this.trackStates[track].muted);
                    muteBtn.setAttribute('aria-pressed', this.trackStates[track].muted);
                }
                const soloBtn = document.getElementById(`solo-${track}`);
                if (soloBtn) {
                    soloBtn.classList.toggle('active', this.trackStates[track].solo);
                    soloBtn.setAttribute('aria-pressed', this.trackStates[track].solo);
                }
                const mixBtn = document.getElementById(`mix-${track}`);
                if (mixBtn) {
                    mixBtn.classList.toggle('active', !!this.mixedPatterns.tracks[track]);
                    mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.tracks[track]);
                }
            });
        }
        Object.keys(this.presets).forEach(key => {
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = !!this.mixedPatterns.presets[key];
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', !!this.mixedPatterns.presets[key]);
                mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.presets[key]);
            }
        });
        this.savedPatterns.forEach((_, name) => {
            const mixBtn = document.getElementById(`mix-saved-${name}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', !!this.mixedPatterns.saved[name]);
                mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.saved[name]);
            }
        });
        const lpfFreq = document.getElementById('lpf-freq');
        if (lpfFreq) {
            lpfFreq.value = this.synthParams.lpf;
            document.getElementById('lpf-freq-value').textContent = `${this.synthParams.lpf} Hz`;
            lpfFreq.setAttribute('aria-valuenow', this.synthParams.lpf);
        }
        const lpq = document.getElementById('lpq');
        if (lpq) {
            lpq.value = this.synthParams.lpq;
            document.getElementById('lpq-value').textContent = this.synthParams.lpq;
            lpq.setAttribute('aria-valuenow', this.synthParams.lpq);
        }
        const room = document.getElementById('room');
        if (room) {
            room.value = this.synthParams.room;
            document.getElementById('room-value').textContent = this.synthParams.room;
            room.setAttribute('aria-valuenow', this.synthParams.room);
        }
        const delay = document.getElementById('delay');
        if (delay) {
            delay.value = this.synthParams.delay;
            document.getElementById('delay-value').textContent = this.synthParams.delay;
            delay.setAttribute('aria-valuenow', this.synthParams.delay);
        }
        const bpm = document.getElementById('bpm');
        if (bpm) {
            bpm.value = this.synthParams.bpm;
            document.getElementById('bpm-value').textContent = this.synthParams.bpm;
            bpm.setAttribute('aria-valuenow', this.synthParams.bpm);
        }
        const bpmEnable = document.getElementById('bpm-enable');
        if (bpmEnable) bpmEnable.checked = this.synthParams.bpmEnabled;
        this.updatePatternBankUI();
        this.updateUndoRedoButtons();
        this.saveToLocalStorage();
    }

    setupSequencer() {
        this.getTracks().forEach(track => {
            this.updateSequencerTrack(track);
        });
        this.adjustSequencerGrid();
        window.addEventListener('resize', () => this.adjustSequencerGrid());
    }

    adjustSequencerGrid() {
        const isSmallScreen = window.innerWidth <= 480;
        this.getTracks().forEach(track => {
            const container = document.getElementById(`${track}-pattern`);
            if (container) {
                const stepCount = this.trackStates[track].steps;
                container.style.gridTemplateColumns = `repeat(${isSmallScreen && stepCount > 8 ? 4 : stepCount}, 1fr)`;
            }
        });
    }

    updateSequencerTrack(track) {
        const container = document.getElementById(`${track}-pattern`);
        if (!container) return;
        const stepCount = this.trackStates[track].steps;
        container.innerHTML = '';
        const isSmallScreen = window.innerWidth <= 480;
        container.style.gridTemplateColumns = `repeat(${isSmallScreen && stepCount > 8 ? 4 : stepCount}, 1fr)`;
        for (let i = 0; i < stepCount; i++) {
            const step = document.createElement('div');
            step.className = 'step';
            step.textContent = i + 1;
            step.dataset.track = track;
            step.dataset.step = i;
            step.setAttribute('role', 'button');
            step.setAttribute('aria-label', `Step ${i + 1} for ${track}`);
            step.tabIndex = 0;
            step.addEventListener('click', () => this.toggleStep(track, i));
            step.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.toggleStep(track, i);
                    e.preventDefault();
                }
            });
            container.appendChild(step);
        }
        this.updateSequencerUI(track);
    }

    toggleStep(track, index) {
        this.saveToHistory();
        this.sequencerState[track][index] = !this.sequencerState[track][index];
        this.updateSequencerUI(track);
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
    }

    updateSequencerUI(track) {
        const container = document.getElementById(`${track}-pattern`);
        if (!container) return;
        const isSoloActive = Object.values(this.trackStates).some(state => state.solo);
        const isEnabled = !isSoloActive || this.trackStates[track].solo;
        const stepCount = this.trackStates[track].steps;
        for (let i = 0; i < stepCount; i++) {
            const step = container.children[i];
            if (step) {
                const active = this.sequencerState[track][i];
                step.classList.toggle('active', active && isEnabled && !this.trackStates[track].muted);
                step.setAttribute('aria-pressed', active);
                step.style.opacity = isEnabled && !this.trackStates[track].muted ? '1' : '0.5';
            }
        }
    }

    createTrackHTML(track) {
        const wrapper = document.getElementById('tracks-wrapper');
        if (!wrapper) return;
        const container = document.createElement('div');
        container.className = 'track-container';
        container.id = `${track}-track`;
        let trackName = track.toUpperCase();
        if (track === 'bd') trackName = 'KICK';
        else if (track === 'sd') trackName = 'SNARE';
        else if (track === 'hh') trackName = 'HI-HAT';
        else if (track === 'cp') trackName = 'CLAP';
        else trackName = `TRACK ${track.toUpperCase()}`;
        const defaultSound = this.trackStates[track]?.sound || 'bd';
        container.innerHTML = `
            <div class="track-header">
                <span class="track-name">${trackName}</span>
                <div>
                    <button class="cyber-btn" id="mute-${track}" aria-label="Mute ${trackName.toLowerCase()} track"><i class="las la-volume-mute"></i> Mute</button>
                    <button class="cyber-btn" id="solo-${track}" aria-label="Solo ${trackName.toLowerCase()} track"><i class="las la-headphones"></i> Solo</button>
                    <button class="cyber-btn" id="mix-${track}" aria-label="Mix ${trackName.toLowerCase()} track"><i class="las la-random"></i> Mix</button>
                </div>
            </div>
            <div class="pattern-grid" id="${track}-pattern"></div>
            <div class="track-controls">
                <select class="step-selector" id="${track}-steps" aria-label="Select number of steps for ${trackName.toLowerCase()}">
                    <option value="4">4 Steps</option>
                    <option value="8" selected>8 Steps</option>
                    <option value="16">16 Steps</option>
                </select>
                <select class="sound-selector" id="${track}-sound" aria-label="Select sound for ${trackName.toLowerCase()}">
                    <option value="bd">Bass Drum</option>
                    <option value="jazz">Kick Drum</option>
                    <option value="bass">Bass</option>
                    <option value="sd">Snare Drum</option>
                    <option value="hh">Hi-Hat</option>
                    <option value="rm">rim</option>
                    <option value="cp">Clap</option>
                    <option value="lt">Low Tom</option>
                    <option value="mt">Mid Tom</option>
                    <option value="ht">High Tom</option>
                    <option value="jvbass">JV Bass</option>
                    <option value="sawtooth">Sawtooth</option>
                    <option value="sine">Sine</option>
                    <option value="triangle">Triangle</option>
                </select>
                <button class="cyber-btn" id="random-${track}" aria-label="Randomize ${trackName.toLowerCase()} track"><i class="las la-dice"></i> Randomize</button>
                <button class="cyber-btn" id="generate-${track}" aria-label="Generate code for ${trackName.toLowerCase()} track"><i class="las la-code"></i> Generate</button>
            </div>
        `;
        wrapper.appendChild(container);
        document.getElementById(`${track}-steps`).value = this.trackStates[track].steps;
        document.getElementById(`${track}-sound`).value = defaultSound;
    }

    recreateSequencer() {
        const wrapper = document.getElementById('tracks-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';
        this.getTracks().forEach(track => {
            this.createTrackHTML(track);
        });
        this.getTracks().forEach(track => {
            this.updateSequencerTrack(track);
        });
        this.getTracks().forEach(track => {
            this.setupTrackListeners(track);
        });
        const removeTrackBtn = document.getElementById('remove-track');
        if (removeTrackBtn) removeTrackBtn.style.display = this.getTracks().length > 4 ? 'inline-flex' : 'none';
        this.adjustSequencerGrid();
    }

    setupTrackListeners(track) {
        const muteBtn = document.getElementById(`mute-${track}`);
        if (muteBtn) muteBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.toggleMute(track);
        });
        const soloBtn = document.getElementById(`solo-${track}`);
        if (soloBtn) soloBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.toggleSolo(track);
        });
        const mixBtn = document.getElementById(`mix-${track}`);
        if (mixBtn) mixBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.mixTrack(track);
        });
        const randomBtn = document.getElementById(`random-${track}`);
        if (randomBtn) randomBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.randomizeTrack(track);
        });
        const generateBtn = document.getElementById(`generate-${track}`);
        if (generateBtn) generateBtn.addEventListener('click', () => this.generateTrackCode(track));
        const stepsEl = document.getElementById(`${track}-steps`);
        if (stepsEl) stepsEl.addEventListener('change', (e) => {
            this.saveToHistory();
            this.changeStepCount(track, parseInt(e.target.value));
        });
        const soundEl = document.getElementById(`${track}-sound`);
        if (soundEl) soundEl.addEventListener('change', (e) => {
            this.saveToHistory();
            this.changeTrackSound(track, e.target.value);
        });
    }

    addTrack() {
        this.saveToHistory();
        const numTracks = this.getTracks().length;
        const newKey = `track${numTracks}`;
        this.sequencerState[newKey] = Array(8).fill(false);
        this.trackStates[newKey] = { muted: false, solo: false, steps: 8, sound: 'bd' };
        this.createTrackHTML(newKey);
        this.updateSequencerTrack(newKey);
        this.setupTrackListeners(newKey);
        const removeTrackBtn = document.getElementById('remove-track');
        if (removeTrackBtn) removeTrackBtn.style.display = 'inline-flex';
        this.adjustSequencerGrid();
        this.saveToLocalStorage();
        this.showNotification(`New track ${newKey.toUpperCase()} added`, 'success');
    }

    removeTrack() {
        const tracks = this.getTracks();
        if (tracks.length <= 4) {
            this.showNotification('Cannot remove original tracks', 'error');
            return;
        }
        const lastKey = tracks[tracks.length - 1];
        const trackEl = document.getElementById(`${lastKey}-track`);
        if (trackEl) trackEl.remove();
        delete this.sequencerState[lastKey];
        delete this.trackStates[lastKey];
        if (this.mixedPatterns.tracks[lastKey]) delete this.mixedPatterns.tracks[lastKey];
        this.saveToHistory();
        const removeTrackBtn = document.getElementById('remove-track');
        if (removeTrackBtn) removeTrackBtn.style.display = this.getTracks().length === 4 ? 'none' : 'inline-flex';
        this.adjustSequencerGrid();
        this.saveToLocalStorage();
        this.showNotification(`Track ${lastKey.toUpperCase()} removed`, 'success');
    }

    setupEventListeners() {
        const debounce = (fn, delay) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        };
        const playBtn = document.getElementById('play-btn');
        if (playBtn) playBtn.addEventListener('click', () => this.togglePlayback());
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) stopBtn.addEventListener('click', () => this.stop());
        const stopCodeBtn = document.getElementById('stop-code-btn');
        if (stopCodeBtn) stopCodeBtn.addEventListener('click', () => this.stop());
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        const redoBtn = document.getElementById('redo-btn');
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
        const evaluateBtn = document.getElementById('evaluate-btn');
        if (evaluateBtn) evaluateBtn.addEventListener('click', () => this.evaluateCode());
        const clearCodeBtn = document.getElementById('clear-code-btn');
        if (clearCodeBtn) clearCodeBtn.addEventListener('click', () => {
            this.saveToHistory();
            const codeEditor = document.getElementById('code-editor');
            if (codeEditor) codeEditor.value = '';
            this.mixedPatterns = { presets: {}, tracks: {}, saved: {} };
            this.getTracks().forEach(track => {
                const mixBtn = document.getElementById(`mix-${track}`);
                if (mixBtn) {
                    mixBtn.classList.remove('active');
                    mixBtn.setAttribute('aria-pressed', 'false');
                }
            });
            Object.keys(this.presets).forEach(key => {
                const chk = document.getElementById(`mix-${key}`);
                if (chk) chk.checked = false;
                const mixBtn = document.getElementById(`mix-preset-${key}`);
                if (mixBtn) {
                    mixBtn.classList.remove('active');
                    mixBtn.setAttribute('aria-pressed', 'false');
                }
            });
            this.savedPatterns.forEach((_, name) => {
                const mixBtn = document.getElementById(`mix-saved-${name}`);
                if (mixBtn) {
                    mixBtn.classList.remove('active');
                    mixBtn.setAttribute('aria-pressed', 'false');
                }
            });
            this.updatePatternBankUI();
            this.saveToLocalStorage();
            this.showNotification('Code cleared', 'success');
        });
        const saveCodeBtn = document.getElementById('save-code-btn');
        if (saveCodeBtn) saveCodeBtn.addEventListener('click', () => this.saveCode());
        const loadCodeBtn = document.getElementById('load-code-btn');
        if (loadCodeBtn) loadCodeBtn.addEventListener('click', () => this.loadCode());
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.addEventListener('input', debounce(() => {
            this.saveToHistory();
            this.saveToLocalStorage();
        }, 500));
        
        // AI Generator Button Listener
        const generateAiBtn = document.getElementById('generate-ai-btn');
        if (generateAiBtn) generateAiBtn.addEventListener('click', () => this.generateAIPattern());

        this.getTracks().forEach(track => this.setupTrackListeners(track));
        const addTrackBtn = document.getElementById('add-track');
        if (addTrackBtn) addTrackBtn.addEventListener('click', () => this.addTrack());
        const removeTrackBtn = document.getElementById('remove-track');
        if (removeTrackBtn) removeTrackBtn.addEventListener('click', () => this.removeTrack());
        const sequencerRandomBtn = document.getElementById('sequencer-random');
        if (sequencerRandomBtn) sequencerRandomBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.randomizeSequencer();
        });
        const sequencerClearBtn = document.getElementById('sequencer-clear');
        if (sequencerClearBtn) sequencerClearBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.clearSequencer();
        });
        const sequencerGenerateBtn = document.getElementById('sequencer-generate');
        if (sequencerGenerateBtn) sequencerGenerateBtn.addEventListener('click', () => this.generateSequencerCode());
        const scopeBtn = document.getElementById('scope-btn');
        if (scopeBtn) scopeBtn.addEventListener('click', () => this.toggleVisualizer('scope'));
        const spectrumBtn = document.getElementById('spectrum-btn');
        if (spectrumBtn) spectrumBtn.addEventListener('click', () => this.toggleVisualizer('spectrum'));
        const updateSynthSlider = (id, param, unit = '') => {
            const slider = document.getElementById(id);
            if (slider) slider.addEventListener('input', debounce((e) => {
                this.synthParams[param] = parseFloat(e.target.value);
                const valueEl = document.getElementById(`${id}-value`);
                if (valueEl) valueEl.textContent = `${this.synthParams[param]}${unit}`;
                slider.setAttribute('aria-valuenow', this.synthParams[param]);
                this.saveToLocalStorage();
            }, 100));
        };
        updateSynthSlider('lpf-freq', 'lpf', ' Hz');
        updateSynthSlider('lpq', 'lpq');
        updateSynthSlider('room', 'room');
        updateSynthSlider('delay', 'delay');
        const updateBpmSlider = () => {
            const slider = document.getElementById('bpm');
            if (slider) slider.addEventListener('input', debounce((e) => {
                this.synthParams.bpm = parseFloat(e.target.value);
                const valueEl = document.getElementById('bpm-value');
                if (valueEl) valueEl.textContent = this.synthParams.bpm;
                slider.setAttribute('aria-valuenow', this.synthParams.bpm);
                this.saveToLocalStorage();
                if (this.synthParams.bpmEnabled) {
                    this.updateMixedCode();
                    this.showNotification(`BPM set to ${this.synthParams.bpm}`, 'success');
                }
            }, 100));
        };
        updateBpmSlider();
        const bpmEnable = document.getElementById('bpm-enable');
        if (bpmEnable) bpmEnable.addEventListener('change', (e) => {
            this.saveToHistory();
            this.synthParams.bpmEnabled = e.target.checked;
            this.updateMixedCode();
            if (this.isPlaying) {
                this.evaluateCode();
            }
            this.saveToLocalStorage();
            this.showNotification(`BPM ${this.synthParams.bpmEnabled ? 'enabled' : 'disabled'}`, 'success');
        });
        const applySynthBtn = document.getElementById('apply-synth');
        if (applySynthBtn) applySynthBtn.addEventListener('click', () => this.applySynthToCode());
        this.setupMixCheckboxes();
        Object.keys(this.presets).forEach(key => {
            const presetBtn = document.getElementById(`preset-${key}`);
            if (presetBtn) presetBtn.addEventListener('click', () => {
                this.saveToHistory();
                this.loadPreset(key);
            });
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) mixBtn.addEventListener('click', () => {
                this.saveToHistory();
                this.mixPreset(key);
            });
        });
        const mixCombineBtn = document.getElementById('mix-combine');
        if (mixCombineBtn) mixCombineBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.combineMix();
        });
        const mixRandomBtn = document.getElementById('mix-random');
        if (mixRandomBtn) mixRandomBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.randomMix();
        });
        const savePatternBtn = document.getElementById('save-pattern-btn');
        if (savePatternBtn) savePatternBtn.addEventListener('click', () => {
            this.saveToHistory();
            this.savePattern();
        });
        const exportPatternsBtn = document.getElementById('export-patterns-btn');
        if (exportPatternsBtn) exportPatternsBtn.addEventListener('click', () => this.exportPatterns());
        const importPatternsBtn = document.getElementById('import-patterns-btn');
        if (importPatternsBtn) importPatternsBtn.addEventListener('click', () => {
            const importFile = document.getElementById('import-file');
            if (importFile) importFile.click();
        });
        const importFile = document.getElementById('import-file');
        if (importFile) importFile.addEventListener('change', (e) => {
            this.saveToHistory();
            this.importPatterns(e);
        });
    }

    async generateAIPattern() {
        const promptInput = document.getElementById('ai-prompt');
        const codeEditor = document.getElementById('code-editor');
        const generateBtn = document.getElementById('generate-ai-btn');

        if (!promptInput || !codeEditor || !generateBtn) {
            this.showNotification('عناصر رابط کاربری برای تولید AI یافت نشد.', 'error');
            return;
        }

        const userQuery = promptInput.value.trim();
        if (!userQuery) {
            this.showNotification('لطفاً ایده خود را برای ساخت الگو وارد کنید.', 'error');
            return;
        }

        generateBtn.innerHTML = '<i class="las la-spinner la-spin"></i> در حال ساخت...';
        generateBtn.disabled = true;

        const PROXY_URL = 'https://script.google.com/macros/s/AKfycbw163NpYvpd6ESxjtJBh8UxsxbZal_kooMQJJxXxwZHxYcT3m4O6gZ57CCqZB_QmTk2/exec';

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: {
                parts: [{
                    text: `Generate a COMPLETE, EXECUTABLE Strudel REPL code snippet for: "${userQuery}".
                    - Output ONLY the pure code – NO explanations, comments, or markdown.
                    - Use JS functions: s('mini-notation for sounds'), note('notes in mini-notation').scale('C:minor'), stack() for layers.
                    - Include effects: .lpf(200-5000), .room(0-1), .delay(0-1).
                    - Sync tempo: setcps(${this.synthParams.bpm / 60 / 4}).
                    - Mini-notation rules: * for repeat (bd*4), / for slow ([c3 eb3]/2), ~ for rest, [ ] for groups, < > for choice, (n,k) for Euclidean (bd(3,8)), @ for elongate.
                    - Examples:
                    - Drum beat: stack( s('bd*4, sd(2,8)'), s('hh*8') ).lpf(800).room(0.5)
                    - Melody: note('c3 eb3 g3 bb3').sound('sawtooth').delay(0.3)
                    - Full techno: setCps(120/60/4); stack( s('bd*4'), note('c2*2 eb2 g2').sound('bass').lpf(200), s('hh(5,8)') ).room(0.4)
                    - User: a basic house beat
                    - Assistant: stack(s('bd*4'), s('~ sd').e(2,4), s('hh*8').gain(0.6))
                    **BAD EXAMPLE (Do NOT do this):**
                    - note('c4 eb4 g4 bb4').scale('minor').sound('sine').slow(2).room(0.8).delay(0.2).
                    Your code must run error-free in Strudel REPL.`
                }]
            }
        };

        try {
            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `درخواست API با خطا مواجه شد: وضعیت ${response.status}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                let generatedCode = candidate.content.parts[0].text;
                generatedCode = generatedCode.replace(/```javascript|```/g, "").trim();
                codeEditor.value = generatedCode;
                this.evaluateCode();
                this.saveToHistory();
                this.showNotification('الگوی جدید با موفقیت ساخته شد!', 'success');
            } else {
                throw new Error('پاسخ نامعتبر از هوش مصنوعی دریافت شد.');
            }
        } catch (error) {
            console.error('خطای تولید AI:', error);
            this.showNotification(`خطا در ساخت الگو: ${error.message}`, 'error');
        } finally {
            generateBtn.innerHTML = '<i class="las la-magic"></i> ساخت الگو';
            generateBtn.disabled = false;
        }
    }


    toggleVisualizer(type) {
        const codeEl = document.getElementById('code-editor');
        if (!codeEl) return;
        let code = codeEl.value.trim();
        if (!code) return;
        const scopeEnd = '.scope()';
        const spectrumEnd = '.spectrum()';
        let hasScope = code.endsWith(scopeEnd);
        let hasSpectrum = code.endsWith(spectrumEnd);
        let newCode = code;
        if (type === 'scope') {
            if (hasScope) {
                newCode = code.slice(0, -scopeEnd.length);
            } else {
                if (hasSpectrum) newCode = code.slice(0, -spectrumEnd.length);
                newCode += scopeEnd;
            }
        } else {
            if (hasSpectrum) {
                newCode = code.slice(0, -spectrumEnd.length);
            } else {
                if (hasScope) newCode = code.slice(0, -scopeEnd.length);
                newCode += spectrumEnd;
            }
        }
        codeEl.value = newCode;
        this.saveToHistory();
        this.evaluateCode();
        const isActive = (type === 'scope' ? newCode.endsWith(scopeEnd) : newCode.endsWith(spectrumEnd));
        const typeBtn = document.getElementById(`${type}-btn`);
        if (typeBtn) typeBtn.classList.toggle('active', isActive);
        const otherType = type === 'scope' ? 'spectrum' : 'scope';
        const otherActive = (type === 'scope' ? newCode.endsWith(spectrumEnd) : newCode.endsWith(scopeEnd));
        const otherBtn = document.getElementById(`${otherType}-btn`);
        if (otherBtn) otherBtn.classList.toggle('active', otherActive);
        this.showNotification(`${type.toUpperCase()} ${isActive ? 'enabled' : 'disabled'}`, 'success');
    }

    get presets() {
        return {
            a: `s('bd,bass(4,8)').jux(rev).gain(0.8)`,
            b: `s('bd,bass(4,8)').jux(rev).gain(0.8).lpf(800).lpq(1).room(0.5).delay(0.3)`,
            c: `s('bd*2,hh(3,4),bass:[1 4](5,8,1)').jux(rev).attack(0.015).stack(s('~ sd')).gain(0.8)`,
            d: `note("[c eb g <f bb>](3,8,<0 1>)".sub(12))
.s("<sawtooth>/64")
.lpf(sine.range(300,2000).slow(16))
.lpa(0.005)
.lpd(perlin.range(.02,.2))
.lps(perlin.range(0,.5).slow(3))
.lpq(sine.range(2,10).slow(32))
.release(.5)
.lpenv(perlin.range(1,8).slow(2))
.ftype('24db')
.room(1)
.juxBy(.5,rev)
.sometimes(add(note(12)))
.stack(s("bd*2").bank('RolandTR909'))
.gain(.5).fast(2)`,
            e: `s("hh*8").gain(".4!2 1 .4!2 1 .4 1").fast(2).layer(
  x => x.degrade().pan(0),
  x => x.undegrade().pan(1))`,
            f: `n("<-4,0 5 2 1>*<2!3 4>")
.scale("<C F>/8:pentatonic")
.s("sine")
.penv("<.5 0 7 -2>*2").vib("4:.1")
.phaser(2).delay(.25).room(.3)
.size(4).fast(1.5)
.fm(3)
.fmdecay(.2)
.fmsustain(1)
.fmenv("<exp lin>")
.fm("<1 2 1.5 1.61>")
.lpf(tri.range(100, 5000).slow(2))
.lpf(tri.range(100, 5000).slow(2))
.vowel("<a e i <o u>>")
.vib("<.5 1 2 4 8 16>:8")
.room(1).roomsize(5).orbit(2)`,
            g: `note("D#1!8").s("sine").penv(34).pdecay(.1).decay(.23).distort("8:.4")`,
            h: `sound("bd*2,<white pink brown>*8")
.decay(.04).sustain(0).scope()`,
            i: `note("c4 d4 e4 f4 g4 a4 b4 c5").sound('sine').gain(0.8)`,
            j: `stack( n("<-4,0 5 2 1>*<2!3 4>")
.scale("<C F>/8:pentatonic")
.s("sine")
.penv("<.5 0 7 -2>*2").vib("4:.1")
.size(4).fast(1.5)
.room(1).roomsize(5).orbit(2))`,
            k: `stack(s('bd*2,jvbass*4(2,8),jvbass(8,8,1)').jux(rev), note('c1 eb1 g1 bb1').sound('sawtooth').lpf(sine.range(500,1000).slow(8)).lpq(5)).fm(sine.range(3,8).slow(100)).gain(0.8)`,
            l: `n("0 1 4 2 0 6 3 2").sound("jazz")`
        };
    }

    setupMixCheckboxes() {
        const container = document.getElementById('mix-checkboxes');
        if (!container) return;
        container.innerHTML = '';
        Object.keys(this.presets).forEach(key => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <label for="mix-${key}">${key.toUpperCase()}: Pattern ${key}</label>
                <input type="checkbox" id="mix-${key}" aria-label="Select pattern ${key} for combining">
                <button class="cyber-btn" id="mix-preset-${key}" aria-label="Mix preset ${key} to code"><i class="las la-random" style="font-size: 1rem;"></i> </button>
            `;
            container.appendChild(div);
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = !!this.mixedPatterns.presets[key];
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', !!this.mixedPatterns.presets[key]);
                mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.presets[key]);
            }
            if (chk) chk.addEventListener('change', (e) => {
                this.saveToHistory();
                this.mixedPatterns.presets[key] = e.target.checked;
                if (mixBtn) {
                    mixBtn.classList.toggle('active', e.target.checked);
                    mixBtn.setAttribute('aria-pressed', e.target.checked);
                }
                this.updateMixedCode();
                this.saveToLocalStorage();
                this.showNotification(`Preset ${key.toUpperCase()} ${e.target.checked ? 'selected' : 'deselected'}`, 'success');
            });
        });
    }

    changeStepCount(track, count) {
        this.trackStates[track].steps = count;
        const current = this.sequencerState[track].slice(0, count);
        this.sequencerState[track] = Array(count).fill(false);
        for (let i = 0; i < Math.min(current.length, count); i++) {
            this.sequencerState[track][i] = current[i];
        }
        this.updateSequencerTrack(track);
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
        this.showNotification(`${track.toUpperCase()} set to ${count} steps`, 'success');
    }

    changeTrackSound(track, sound) {
        this.trackStates[track].sound = sound;
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
        this.showNotification(`${track.toUpperCase()} sound set to ${sound}`, 'success');
    }

    randomizeTrack(track) {
        const stepCount = this.trackStates[track].steps;
        this.sequencerState[track] = Array(stepCount).fill(false).map(() => Math.random() > 0.7);
        this.updateSequencerUI(track);
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
        this.showNotification(`${track.toUpperCase()} randomized`, 'success');
    }

    generateTrackCode(track) {
        if (this.trackStates[track].muted || (Object.values(this.trackStates).some(state => state.solo) && !this.trackStates[track].solo)) {
            this.showNotification(`${track.toUpperCase()} is muted or not soloed`, 'error');
            return;
        }
        const stepCount = this.trackStates[track].steps;
        const sound = this.trackStates[track].sound;
        const steps = this.sequencerState[track].slice(0, stepCount).map(active => active ? 'x' : '~').join(' ');
        if (!steps.includes('x')) {
            this.showNotification(`No active steps in ${track.toUpperCase()}`, 'error');
            return;
        }
        let code = ['sawtooth', 'sine', 'triangle'].includes(sound)
            ? `note('c3').sound('${sound}').struct("${steps}").gain(0.8)`
            : `s("${sound}*${stepCount}").struct("${steps}").gain(0.8)`;
        if (this.synthParams.bpmEnabled) {
            code = `setCps(${this.synthParams.bpm}/60/4)\n${code}`;
        }
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = code;
        this.mixedPatterns = { presets: {}, tracks: { [track]: true }, saved: {} };
        this.getTracks().forEach(t => {
            const mixBtn = document.getElementById(`mix-${t}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', t === track);
                mixBtn.setAttribute('aria-pressed', t === track);
            }
        });
        Object.keys(this.presets).forEach(key => {
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = false;
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.savedPatterns.forEach((_, name) => {
            const mixBtn = document.getElementById(`mix-saved-${name}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.updatePatternBankUI();
        this.evaluateCode();
        this.saveToHistory();
        this.showNotification(`Code generated for ${track.toUpperCase()} with ${sound}`, 'success');
    }

    updateMixedCode() {
        const patterns = [];
        
        // First handle track patterns
        this.getTracks().forEach(track => {
            if (this.mixedPatterns.tracks[track]) {
                if (this.trackStates[track].muted || (Object.values(this.trackStates).some(state => state.solo) && !this.trackStates[track].solo)) {
                    return;
                }
                const stepCount = this.trackStates[track].steps;
                const sound = this.trackStates[track].sound;
                const steps = this.sequencerState[track].slice(0, stepCount).map(active => active ? 'x' : '~').join(' ');
                if (steps.includes('x')) {
                    const code = ['sawtooth', 'sine', 'triangle'].includes(sound)
                        ? `note('c3').sound('${sound}').struct("${steps}").gain(0.8)`
                        : `s("${sound}*${stepCount}").struct("${steps}").gain(0.8)`;
                    patterns.push(code);
                }
            }
        });

        // Then handle preset patterns
        Object.keys(this.mixedPatterns.presets).forEach(key => {
            if (this.mixedPatterns.presets[key]) {
                patterns.push(this.presets[key]);
            }
        });

        // Finally handle saved patterns - using their exact saved code
        Object.keys(this.mixedPatterns.saved).forEach(name => {
            if (this.mixedPatterns.saved[name]) {
                const pattern = this.savedPatterns.get(name);
                if (pattern && pattern.code) {
                    // Use the exact saved pattern code without modification
                    patterns.push(pattern.code);
                }
            }
        });

        // Combine all patterns
        let newCode;
        if (patterns.length === 1) {
            // If there's only one pattern, don't wrap it in stack()
            newCode = patterns[0];
        } else if (patterns.length > 1) {
            newCode = `stack(${patterns.join(', ')})`;
        } else {
            newCode = '';
        }

        // Add BPM if enabled
        if (this.synthParams.bpmEnabled && patterns.length > 0) {
            newCode = `setCps(${this.synthParams.bpm}/60/4)\n${newCode}`;
        }

        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = newCode;
        if (newCode && this.isPlaying) {
            this.evaluateCode();
        } else if (!newCode) {
            this.stop();
            this.showNotification('No active patterns to play', 'error');
        }
    }

    mixTrack(track) {
        if (this.trackStates[track].muted || (Object.values(this.trackStates).some(state => state.solo) && !this.trackStates[track].solo)) {
            this.showNotification(`${track.toUpperCase()} is muted or not soloed`, 'error');
            return;
        }
        const stepCount = this.trackStates[track].steps;
        const sound = this.trackStates[track].sound;
        const steps = this.sequencerState[track].slice(0, stepCount).map(active => active ? 'x' : '~').join(' ');
        if (!steps.includes('x')) {
            this.showNotification(`No active steps in ${track.toUpperCase()}`, 'error');
            return;
        }
        this.mixedPatterns.tracks[track] = !this.mixedPatterns.tracks[track];
        const mixBtn = document.getElementById(`mix-${track}`);
        if (mixBtn) {
            mixBtn.classList.toggle('active', this.mixedPatterns.tracks[track]);
            mixBtn.setAttribute('aria-pressed', this.mixedPatterns.tracks[track]);
        }
        this.updateMixedCode();
        this.saveToHistory();
        this.showNotification(`Track ${track.toUpperCase()} ${this.mixedPatterns.tracks[track] ? 'mixed' : 'removed'}`, 'success');
    }

    mixPreset(key) {
        const presetCode = this.presets[key];
        if (!presetCode) {
            this.showNotification(`Preset ${key.toUpperCase()} is not valid`, 'error');
            return;
        }
        this.mixedPatterns.presets[key] = !this.mixedPatterns.presets[key];
        const chk = document.getElementById(`mix-${key}`);
        if (chk) chk.checked = this.mixedPatterns.presets[key];
        const mixBtn = document.getElementById(`mix-preset-${key}`);
        if (mixBtn) {
            mixBtn.classList.toggle('active', this.mixedPatterns.presets[key]);
            mixBtn.setAttribute('aria-pressed', this.mixedPatterns.presets[key]);
        }
        this.updateMixedCode();
        this.saveToHistory();
        this.showNotification(`Preset ${key.toUpperCase()} ${this.mixedPatterns.presets[key] ? 'mixed' : 'removed'}`, 'success');
    }

    parsePresetToSequencer(presetCode) {
        this.getTracks().forEach(track => {
            const regex = new RegExp(`s\\(['"]([^'"]*${track}[^'"]*)['"]\\)`, 'g');
            const match = presetCode.match(regex);
            if (match) {
                const pattern = match[0].match(/['"]([^'"]*)['"]/)[1];
                const steps = pattern.split(/[, ]+/).filter(s => s.includes(track));
                if (steps.length > 0) {
                    const stepCount = this.trackStates[track].steps;
                    this.sequencerState[track] = Array(stepCount).fill(false);
                    const structMatch = presetCode.match(/\.struct\(['"]([^'"]*)['"]\)/);
                    if (structMatch) {
                        const struct = structMatch[1].split(' ').slice(0, stepCount);
                        struct.forEach((s, i) => {
                            if (s === 'x') this.sequencerState[track][i] = true;
                        });
                    } else {
                        steps[0].split(/[*()]+/).forEach((s, i) => {
                            if (i < stepCount && s.includes(track)) {
                                this.sequencerState[track][i] = true;
                            }
                        });
                    }
                    this.updateSequencerUI(track);
                }
            }
        });
    }

    async evaluateCode() {
        if (!this.strudelReady || !this.strudelAPI) {
            this.showNotification('Strudel not initialized. Please wait.', 'error');
            return;
        }
        const codeEditor = document.getElementById('code-editor');
        if (!codeEditor) {
            this.showNotification('Code editor not found', 'error');
            return;
        }
        const code = codeEditor.value.trim();
        if (!code) {
            this.showNotification('No code to evaluate', 'error');
            return;
        }
        try {
            if (this.currentPattern) {
                this.stop();
            }
            if (this.synthParams.bpmEnabled && this.strudelAPI.setCps) {
                this.strudelAPI.setCps(this.synthParams.bpm / 60 / 4);
            }
            const { evaluate } = this.strudelAPI;
            this.currentPattern = await evaluate(code);
            this.isPlaying = true;
            document.body.classList.add('playing');
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                playBtn.classList.add('active');
                playBtn.innerHTML = '<i class="las la-pause"></i> Pause';
            }
            const evaluateBtn = document.getElementById('evaluate-btn');
            if (evaluateBtn) evaluateBtn.classList.add('active');
            const audioStatus = document.getElementById('audio-status');
            if (audioStatus) audioStatus.innerHTML = '<i class="las la-volume-up"></i> Playing';
            this.showNotification('Code playing', 'success');
        } catch (error) {
            console.error('Code evaluation failed:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    stop() {
        if (!this.strudelReady || !this.strudelAPI) {
            this.showNotification('Strudel not initialized. Cannot stop.', 'error');
            return;
        }
        try {
            const { hush } = this.strudelAPI;
            if (hush) {
                hush();
            }
            this.currentPattern = null;
            this.isPlaying = false;
            document.body.classList.remove('playing');
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                playBtn.classList.remove('active');
                playBtn.innerHTML = '<i class="las la-play"></i> Play';
            }
            const evaluateBtn = document.getElementById('evaluate-btn');
            if (evaluateBtn) evaluateBtn.classList.remove('active');
            const audioStatus = document.getElementById('audio-status');
            if (audioStatus) audioStatus.innerHTML = '<i class="las la-volume-up"></i> Ready';
            this.showNotification('Playback stopped', 'success');
        } catch (error) {
            console.error('Stop failed:', error);
            this.showNotification('Failed to stop playback', 'error');
        }
        this.saveToLocalStorage();
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.evaluateCode();
        }
    }

    toggleMute(track) {
        this.trackStates[track].muted = !this.trackStates[track].muted;
        this.trackStates[track].solo = false;
        const muteBtn = document.getElementById(`mute-${track}`);
        if (muteBtn) {
            muteBtn.classList.toggle('active', this.trackStates[track].muted);
            muteBtn.setAttribute('aria-pressed', this.trackStates[track].muted);
        }
        const soloBtn = document.getElementById(`solo-${track}`);
        if (soloBtn) {
            soloBtn.classList.remove('active');
            soloBtn.setAttribute('aria-pressed', 'false');
        }
        this.getTracks().forEach(t => this.updateSequencerUI(t));
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
        this.showNotification(`${track.toUpperCase()} ${this.trackStates[track].muted ? 'muted' : 'unmuted'}`, 'success');
    }

    toggleSolo(track) {
        const wasSolo = this.trackStates[track].solo;
        Object.keys(this.trackStates).forEach(t => {
            this.trackStates[t].solo = t === track ? !wasSolo : false;
            const soloBtn = document.getElementById(`solo-${t}`);
            if (soloBtn) {
                soloBtn.classList.toggle('active', t === track && !wasSolo);
                soloBtn.setAttribute('aria-pressed', t === track && !wasSolo);
            }
            if (t !== track) {
                this.trackStates[t].muted = false;
                const muteBtn = document.getElementById(`mute-${t}`);
                if (muteBtn) {
                    muteBtn.classList.remove('active');
                    muteBtn.setAttribute('aria-pressed', 'false');
                }
            }
        });
        this.getTracks().forEach(t => this.updateSequencerUI(t));
        if (Object.values(this.mixedPatterns.tracks).some(v => v)) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
        this.showNotification(`${track.toUpperCase()} ${!wasSolo ? 'soloed' : 'unsoloed'}`, 'success');
    }

    randomizeSequencer() {
        this.getTracks().forEach(track => {
            this.randomizeTrack(track);
        });
        this.showNotification('All tracks randomized', 'success');
    }

    clearSequencer() {
        this.getTracks().forEach(track => {
            this.sequencerState[track] = Array(this.trackStates[track].steps).fill(false);
            this.updateSequencerUI(track);
            this.mixedPatterns.tracks[track] = false;
            const mixBtn = document.getElementById(`mix-${track}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.mixedPatterns.saved = {};
        this.updatePatternBankUI();
        this.updateMixedCode();
        this.saveToLocalStorage();
        this.showNotification('Sequencer cleared', 'success');
    }

    generateSequencerCode() {
        const patterns = [];
        const isSoloActive = Object.values(this.trackStates).some(state => state.solo);
        this.getTracks().forEach(track => {
            if (this.trackStates[track].muted || (isSoloActive && !this.trackStates[track].solo)) {
                return;
            }
            const stepCount = this.trackStates[track].steps;
            const sound = this.trackStates[track].sound;
            const steps = this.sequencerState[track].slice(0, stepCount).map(active => active ? 'x' : '~').join(' ');
            if (steps.includes('x')) {
                const code = ['sawtooth', 'sine', 'triangle'].includes(sound)
                    ? `note('c3').sound('${sound}').struct("${steps}").gain(0.8)`
                    : `s("${sound}*${stepCount}").struct("${steps}").gain(0.8)`;
                patterns.push(code);
            }
        });
        if (patterns.length === 0) {
            this.showNotification('No active steps to generate code', 'error');
            return;
        }
        let newCode = `stack(${patterns.join(', ')})`;
        if (this.synthParams.bpmEnabled) {
            newCode = `setCps(${this.synthParams.bpm}/60/4)\n${newCode}`;
        }
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = newCode;
        this.mixedPatterns = { presets: {}, tracks: {}, saved: {} };
        this.getTracks().forEach(track => {
            this.mixedPatterns.tracks[track] = true;
            const mixBtn = document.getElementById(`mix-${track}`);
            if (mixBtn) {
                mixBtn.classList.add('active');
                mixBtn.setAttribute('aria-pressed', 'true');
            }
        });
        Object.keys(this.presets).forEach(key => {
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = false;
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.savedPatterns.forEach((_, name) => {
            const mixBtn = document.getElementById(`mix-saved-${name}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.updatePatternBankUI();
        this.evaluateCode();
        this.saveToHistory();
        this.showNotification('Sequencer code generated', 'success');
    }

    applySynthToCode() {
        const codeEditor = document.getElementById('code-editor');
        if (!codeEditor) {
            this.showNotification('Code editor not found', 'error');
            return;
        }
        let code = codeEditor.value.trim();
        if (!code) {
            this.showNotification('No code to apply synth parameters', 'error');
            return;
        }
        code = code.replace(/\.lpf\(\d+\)/g, '').replace(/\.lpq\(\d+\.?(\d+)?\)/g, '').replace(/\.room\(\d+\.?(\d+)?\)/g, '').replace(/\.delay\(\d+\.?(\d+)?\)/g, '');
        code += `.lpf(${this.synthParams.lpf}).lpq(${this.synthParams.lpq}).room(${this.synthParams.room}).delay(${this.synthParams.delay})`;
        codeEditor.value = code;
        this.evaluateCode();
        this.saveToHistory();
        this.showNotification('Synth parameters applied', 'success');
    }

    combineMix() {
        const selectedPresets = Object.keys(this.mixedPatterns.presets).filter(key => this.mixedPatterns.presets[key]);
        const selectedTracks = Object.keys(this.mixedPatterns.tracks).filter(track => this.mixedPatterns.tracks[track]);
        const selectedSaved = Object.keys(this.mixedPatterns.saved).filter(name => this.mixedPatterns.saved[name]);
        if (selectedPresets.length === 0 && selectedTracks.length === 0 && selectedSaved.length === 0) {
            this.showNotification('No patterns selected for combining', 'error');
            return;
        }
        this.updateMixedCode();
        this.showNotification('Patterns combined', 'success');
    }

    randomMix() {
        const keys = Object.keys(this.presets);
        const randomKeys = [];
        while (randomKeys.length < 3 && keys.length > 0) {
            const idx = Math.floor(Math.random() * keys.length);
            randomKeys.push(keys.splice(idx, 1)[0]);
        }
        Object.keys(this.presets).forEach(key => {
            this.mixedPatterns.presets[key] = randomKeys.includes(key);
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = randomKeys.includes(key);
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', randomKeys.includes(key));
                mixBtn.setAttribute('aria-pressed', randomKeys.includes(key));
            }
        });
        this.getTracks().forEach(track => {
            this.mixedPatterns.tracks[track] = false;
            const mixBtn = document.getElementById(`mix-${track}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.mixedPatterns.saved = {};
        this.updatePatternBankUI();
        this.updateMixedCode();
        this.showNotification('Random patterns selected', 'success');
    }

    loadPreset(key) {
        const presetCode = this.presets[key];
        if (!presetCode) {
            this.showNotification(`Preset ${key.toUpperCase()} not found`, 'error');
            return;
        }
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = presetCode;
        this.mixedPatterns = { presets: { [key]: true }, tracks: {}, saved: {} };
        Object.keys(this.presets).forEach(k => {
            const chk = document.getElementById(`mix-${k}`);
            if (chk) chk.checked = k === key;
            const mixBtn = document.getElementById(`mix-preset-${k}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', k === key);
                mixBtn.setAttribute('aria-pressed', k === key);
            }
        });
        this.getTracks().forEach(track => {
            this.mixedPatterns.tracks[track] = false;
            const mixBtn = document.getElementById(`mix-${track}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.mixedPatterns.saved = {};
        this.updatePatternBankUI();
        this.parsePresetToSequencer(presetCode);
        this.evaluateCode();
        this.saveToHistory();
        this.showNotification(`Preset ${key.toUpperCase()} loaded`, 'success');
    }

    savePattern() {
        const patternNameInput = document.getElementById('pattern-name');
        if (!patternNameInput) {
            this.showNotification('Pattern name input not found', 'error');
            return;
        }
        const name = patternNameInput.value.trim();
        if (!name) {
            this.showNotification('Pattern name is required', 'error');
            return;
        }
        const codeEditor = document.getElementById('code-editor');
        if (!codeEditor) {
            this.showNotification('Code editor not found', 'error');
            return;
        }
        const code = codeEditor.value.trim();
        if (!code) {
            this.showNotification('No code to save', 'error');
            return;
        }
        this.savedPatterns.set(name, {
            code,
            sequencerState: JSON.parse(JSON.stringify(this.sequencerState)),
            trackStates: JSON.parse(JSON.stringify(this.trackStates)),
            synthParams: JSON.parse(JSON.stringify(this.synthParams))
        });
        this.updatePatternBankUI();
        this.saveToLocalStorage();
        this.showNotification(`Pattern "${name}" saved`, 'success');
    }

    updatePatternBankUI() {
        const container = document.getElementById('pattern-bank');
        if (!container) {
            this.showNotification('Pattern bank container not found', 'error');
            return;
        }
        container.innerHTML = '';
        this.savedPatterns.forEach((pattern, name) => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <span>${name}</span>
                <div>
                    <button class="cyber-btn" data-name="${name}" data-action="load" aria-label="Load pattern ${name}"><i class="las la-folder-open"></i> Load</button>
                    <button class="cyber-btn" data-name="${name}" data-action="mix" id="mix-saved-${name}" aria-label="Mix pattern ${name}"><i class="las la-random"></i> Mix</button>
                    <button class="cyber-btn" data-name="${name}" data-action="delete" aria-label="Delete pattern ${name}"><i class="las la-trash"></i> Delete</button>
                </div>
            `;
            container.appendChild(div);
            const mixBtn = document.getElementById(`mix-saved-${name}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', !!this.mixedPatterns.saved[name]);
                mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.saved[name]);
            }
        });
        container.querySelectorAll('button[data-action="load"]').forEach(btn => {
            btn.removeEventListener('click', btn._loadHandler); // Remove previous listener if exists
            btn._loadHandler = () => {
                this.saveToHistory();
                this.loadPattern(btn.dataset.name);
            };
            btn.addEventListener('click', btn._loadHandler);
        });
        container.querySelectorAll('button[data-action="mix"]').forEach(btn => {
            btn.removeEventListener('click', btn._mixHandler); // Remove previous listener if exists
            btn._mixHandler = () => {
                this.saveToHistory();
                this.mixSavedPattern(btn.dataset.name);
            };
            btn.addEventListener('click', btn._mixHandler);
        });
        container.querySelectorAll('button[data-action="delete"]').forEach(btn => {
            btn.removeEventListener('click', btn._deleteHandler); // Remove previous listener if exists
            btn._deleteHandler = () => {
                this.saveToHistory();
                this.deletePattern(btn.dataset.name);
            };
            btn.addEventListener('click', btn._deleteHandler);
        });
    }

    mixSavedPattern(name) {
        const pattern = this.savedPatterns.get(name);
        if (!pattern || !pattern.code) {
            this.showNotification(`Saved pattern "${name}" is not valid`, 'error');
            return;
        }

        // Toggle the mix state for this pattern
        this.mixedPatterns.saved[name] = !this.mixedPatterns.saved[name];

        // Update the mix button state
        const mixBtn = document.getElementById(`mix-saved-${name}`);
        if (mixBtn) {
            mixBtn.classList.toggle('active', this.mixedPatterns.saved[name]);
            mixBtn.setAttribute('aria-pressed', this.mixedPatterns.saved[name]);
        }

        // Don't modify the sequencer state when mixing
        // Just update the mixed code to include or remove this pattern
        this.updateMixedCode();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Saved pattern "${name}" ${this.mixedPatterns.saved[name] ? 'mixed' : 'removed'}`, 'success');
    }

    loadPattern(name) {
        const pattern = this.savedPatterns.get(name);
        if (!pattern) {
            this.showNotification(`Pattern "${name}" not found`, 'error');
            return;
        }
        this.sequencerState = JSON.parse(JSON.stringify(pattern.sequencerState));
        this.trackStates = JSON.parse(JSON.stringify(pattern.trackStates));
        this.synthParams = JSON.parse(JSON.stringify(pattern.synthParams));
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = pattern.code;
        this.mixedPatterns = { presets: {}, tracks: {}, saved: { [name]: true } };
        Object.keys(this.presets).forEach(key => {
            const chk = document.getElementById(`mix-${key}`);
            if (chk) chk.checked = false;
            const mixBtn = document.getElementById(`mix-preset-${key}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.getTracks().forEach(track => {
            this.mixedPatterns.tracks[track] = false;
            const mixBtn = document.getElementById(`mix-${track}`);
            if (mixBtn) {
                mixBtn.classList.remove('active');
                mixBtn.setAttribute('aria-pressed', 'false');
            }
        });
        this.savedPatterns.forEach((_, n) => {
            const mixBtn = document.getElementById(`mix-saved-${n}`);
            if (mixBtn) {
                mixBtn.classList.toggle('active', n === name);
                mixBtn.setAttribute('aria-pressed', n === name);
            }
        });
        const originalTracks = ['bd', 'sd', 'hh', 'cp'];
        const hasExtra = Object.keys(this.sequencerState).some(k => !originalTracks.includes(k));
        if (hasExtra) {
            this.recreateSequencer();
        } else {
            this.getTracks().forEach(track => {
                const stepsEl = document.getElementById(`${track}-steps`);
                if (stepsEl) stepsEl.value = this.trackStates[track].steps;
                const soundEl = document.getElementById(`${track}-sound`);
                if (soundEl) soundEl.value = this.trackStates[track].sound;
                this.updateSequencerUI(track);
                const muteBtn = document.getElementById(`mute-${track}`);
                if (muteBtn) {
                    muteBtn.classList.toggle('active', this.trackStates[track].muted);
                    muteBtn.setAttribute('aria-pressed', this.trackStates[track].muted);
                }
                const soloBtn = document.getElementById(`solo-${track}`);
                if (soloBtn) {
                    soloBtn.classList.toggle('active', this.trackStates[track].solo);
                    soloBtn.setAttribute('aria-pressed', this.trackStates[track].solo);
                }
                const mixBtn = document.getElementById(`mix-${track}`);
                if (mixBtn) {
                    mixBtn.classList.toggle('active', !!this.mixedPatterns.tracks[track]);
                    mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.tracks[track]);
                }
            });
        }
        const lpfFreq = document.getElementById('lpf-freq');
        if (lpfFreq) {
            lpfFreq.value = this.synthParams.lpf;
            document.getElementById('lpf-freq-value').textContent = `${this.synthParams.lpf} Hz`;
            lpfFreq.setAttribute('aria-valuenow', this.synthParams.lpf);
        }
        const lpq = document.getElementById('lpq');
        if (lpq) {
            lpq.value = this.synthParams.lpq;
            document.getElementById('lpq-value').textContent = this.synthParams.lpq;
            lpq.setAttribute('aria-valuenow', this.synthParams.lpq);
        }
        const room = document.getElementById('room');
        if (room) {
            room.value = this.synthParams.room;
            document.getElementById('room-value').textContent = this.synthParams.room;
            room.setAttribute('aria-valuenow', this.synthParams.room);
        }
        const delay = document.getElementById('delay');
        if (delay) {
            delay.value = this.synthParams.delay;
            document.getElementById('delay-value').textContent = this.synthParams.delay;
            delay.setAttribute('aria-valuenow', this.synthParams.delay);
        }
        const bpm = document.getElementById('bpm');
        if (bpm) {
            bpm.value = this.synthParams.bpm;
            document.getElementById('bpm-value').textContent = this.synthParams.bpm;
            bpm.setAttribute('aria-valuenow', this.synthParams.bpm);
        }
        const bpmEnable = document.getElementById('bpm-enable');
        if (bpmEnable) bpmEnable.checked = this.synthParams.bpmEnabled;
        this.updatePatternBankUI();
        this.evaluateCode();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Pattern "${name}" loaded`, 'success');
    }

    deletePattern(name) {
        if (!this.savedPatterns.has(name)) {
            this.showNotification(`Pattern "${name}" not found`, 'error');
            return;
        }
        this.mixedPatterns.saved[name] = false;
        const mixBtn = document.getElementById(`mix-saved-${name}`);
        if (mixBtn) {
            mixBtn.classList.remove('active');
            mixBtn.setAttribute('aria-pressed', 'false');
        }
        this.savedPatterns.delete(name);
        delete this.mixedPatterns.saved[name];
        this.updatePatternBankUI();
        this.updateMixedCode();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Pattern "${name}" deleted`, 'success');
    }

    exportPatterns() {
        const data = JSON.stringify([...this.savedPatterns], null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cybersynth_patterns.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Patterns exported', 'success');
    }

    importPatterns(event) {
        const file = event.target.files[0];
        if (!file) {
            this.showNotification('No file selected', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.savedPatterns = new Map(data);
                this.mixedPatterns.saved = {};
                this.updatePatternBankUI();
                this.updateMixedCode();
                this.saveToHistory();
                this.saveToLocalStorage();
                this.showNotification('Patterns imported', 'success');
            } catch (error) {
                this.showNotification('Invalid pattern file', 'error');
            }
        };
        reader.readAsText(file);
    }

    saveCode() {
        const codeEditor = document.getElementById('code-editor');
        if (!codeEditor) {
            this.showNotification('Code editor not found', 'error');
            return;
        }
        const code = codeEditor.value.trim();
        if (!code) {
            this.showNotification('No code to save', 'error');
            return;
        }
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cybersynth_code.txt';
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Code saved', 'success');
    }

    loadCode() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                this.showNotification('No file selected', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.saveToHistory();
                const codeEditor = document.getElementById('code-editor');
                if (codeEditor) codeEditor.value = ev.target.result;
                this.mixedPatterns = { presets: {}, tracks: {}, saved: {} };
                this.getTracks().forEach(track => {
                    const mixBtn = document.getElementById(`mix-${track}`);
                    if (mixBtn) {
                        mixBtn.classList.remove('active');
                        mixBtn.setAttribute('aria-pressed', 'false');
                    }
                });
                Object.keys(this.presets).forEach(key => {
                    const chk = document.getElementById(`mix-${key}`);
                    if (chk) chk.checked = false;
                    const mixBtn = document.getElementById(`mix-preset-${key}`);
                    if (mixBtn) {
                        mixBtn.classList.remove('active');
                        mixBtn.setAttribute('aria-pressed', 'false');
                    }
                });
                this.savedPatterns.forEach((_, name) => {
                    const mixBtn = document.getElementById(`mix-saved-${name}`);
                    if (mixBtn) {
                                            mixBtn.classList.remove('active');
                        mixBtn.setAttribute('aria-pressed', 'false');
                    }
                });
                this.updatePatternBankUI();
                this.evaluateCode();
                this.saveToHistory();
                this.saveToLocalStorage();
                this.showNotification('Code loaded', 'success');
            };
            reader.readAsText(file);
        };
        input.click();
    }

    saveToLocalStorage() {
        const state = {
            sequencerState: this.sequencerState,
            trackStates: this.trackStates,
            mixedPatterns: this.mixedPatterns,
            savedPatterns: [...this.savedPatterns], // Convert Map to array for storage
            synthParams: this.synthParams,
            code: document.getElementById('code-editor')?.value || ''
        };
        try {
            localStorage.setItem('cybersynth_state', JSON.stringify(state));
            console.log('State saved to localStorage');
        } catch (error) {
            console.error('Failed to save to local storage:', error);
            this.showNotification('Failed to save state to local storage', 'error');
        }
    }

    loadSavedData() {
        try {
            const saved = localStorage.getItem('cybersynth_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate and set sequencerState
                this.sequencerState = parsed.sequencerState || this.sequencerState;
                // Validate and set trackStates
                this.trackStates = parsed.trackStates || this.trackStates;
                // Ensure mixedPatterns has all required properties
                this.mixedPatterns = parsed.mixedPatterns || { presets: {}, tracks: {}, saved: {} };
                // Ensure savedPatterns is a Map
                this.savedPatterns = new Map(parsed.savedPatterns || []);
                // Validate synthParams
                this.synthParams = parsed.synthParams || this.synthParams;
                // Update code editor
                const codeEditor = document.getElementById('code-editor');
                if (codeEditor && parsed.code) {
                    codeEditor.value = parsed.code;
                }
                // Update UI for tracks
                this.getTracks().forEach(track => {
                    const stepsEl = document.getElementById(`${track}-steps`);
                    if (stepsEl) stepsEl.value = this.trackStates[track]?.steps || 8;
                    const soundEl = document.getElementById(`${track}-sound`);
                    if (soundEl) soundEl.value = this.trackStates[track]?.sound || 'bd';
                    this.updateSequencerUI(track);
                    const muteBtn = document.getElementById(`mute-${track}`);
                    if (muteBtn) {
                        muteBtn.classList.toggle('active', !!this.trackStates[track]?.muted);
                        muteBtn.setAttribute('aria-pressed', !!this.trackStates[track]?.muted);
                    }
                    const soloBtn = document.getElementById(`solo-${track}`);
                    if (soloBtn) {
                        soloBtn.classList.toggle('active', !!this.trackStates[track]?.solo);
                        soloBtn.setAttribute('aria-pressed', !!this.trackStates[track]?.solo);
                    }
                    const mixBtn = document.getElementById(`mix-${track}`);
                    if (mixBtn) {
                        mixBtn.classList.toggle('active', !!this.mixedPatterns.tracks[track]);
                        mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.tracks[track]);
                    }
                });
                // Update UI for presets
                Object.keys(this.presets).forEach(key => {
                    const chk = document.getElementById(`mix-${key}`);
                    if (chk) chk.checked = !!this.mixedPatterns.presets[key];
                    const mixBtn = document.getElementById(`mix-preset-${key}`);
                    if (mixBtn) {
                        mixBtn.classList.toggle('active', !!this.mixedPatterns.presets[key]);
                        mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.presets[key]);
                    }
                });
                // Update UI for saved patterns
                this.savedPatterns.forEach((_, name) => {
                    const mixBtn = document.getElementById(`mix-saved-${name}`);
                    if (mixBtn) {
                        mixBtn.classList.toggle('active', !!this.mixedPatterns.saved[name]);
                        mixBtn.setAttribute('aria-pressed', !!this.mixedPatterns.saved[name]);
                    }
                });
                // Update synth controls
                const lpfFreq = document.getElementById('lpf-freq');
                if (lpfFreq) {
                    lpfFreq.value = this.synthParams.lpf || 800;
                    document.getElementById('lpf-freq-value').textContent = `${this.synthParams.lpf || 800} Hz`;
                    lpfFreq.setAttribute('aria-valuenow', this.synthParams.lpf || 800);
                }
                const lpq = document.getElementById('lpq');
                if (lpq) {
                    lpq.value = this.synthParams.lpq || 1;
                    document.getElementById('lpq-value').textContent = this.synthParams.lpq || 1;
                    lpq.setAttribute('aria-valuenow', this.synthParams.lpq || 1);
                }
                const room = document.getElementById('room');
                if (room) {
                    room.value = this.synthParams.room || 0.5;
                    document.getElementById('room-value').textContent = this.synthParams.room || 0.5;
                    room.setAttribute('aria-valuenow', this.synthParams.room || 0.5);
                }
                const delay = document.getElementById('delay');
                if (delay) {
                    delay.value = this.synthParams.delay || 0.3;
                    document.getElementById('delay-value').textContent = this.synthParams.delay || 0.3;
                    delay.setAttribute('aria-valuenow', this.synthParams.delay || 0.3);
                }
                const bpm = document.getElementById('bpm');
                if (bpm) {
                    bpm.value = this.synthParams.bpm || 120;
                    document.getElementById('bpm-value').textContent = this.synthParams.bpm || 120;
                    bpm.setAttribute('aria-valuenow', this.synthParams.bpm || 120);
                }
                const bpmEnable = document.getElementById('bpm-enable');
                if (bpmEnable) bpmEnable.checked = this.synthParams.bpmEnabled !== false;
                // Ensure Pattern Bank UI is updated
                this.updatePatternBankUI();
                this.updateUndoRedoButtons();
                console.log('Saved data loaded successfully');
            }
        } catch (error) {
            console.error('Failed to load saved data:', error);
            this.showNotification('Failed to load saved state from local storage', 'error');
        }
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        if (!notification) {
            console.log(`Notification: ${message} (${type})`);
            return;
        }
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}
const app = new CyberStrudel();




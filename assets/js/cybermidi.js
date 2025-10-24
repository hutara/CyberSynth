/**
 * Main class for CyberMidi, managing MIDI sequencer, code editor, and MIDI output.
 * @class
 */
class CyberMidi {
    constructor() {
        this.currentPattern = null;
        this.isPlaying = false;
        this.sequencerState = {
            note: Array(8).fill(false)
        };
        this.trackStates = {
            note: { muted: false, solo: false, steps: 8, sound: 'C4' }
        };
        this.synthParams = {
            bpm: 120,
            bpmEnabled: true
        };
        this.midiAccess = null;
        this.midiOutputs = [];
        this.midiOutput = null;
        this.midiEnabled = false;
        this.mixedPatterns = {
            tracks: {},
            saved: {}
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
            await this.initMIDI();
            this.setupSequencer();
            this.setupEventListeners();
            this.loadSavedData();
            this.saveToHistory();
            this.showNotification('CyberMidi initialized!', 'success');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification('Failed to initialize. Check console for details.', 'error');
        }
    }

    async initStrudel() {
        try {
            const { initStrudel, setCps } = window.strudel;
            this.strudelAPI = window.strudel;
            await initStrudel();
            if (setCps) {
                setCps(this.synthParams.bpm / 60 / 4);
            }
        } catch (error) {
            throw new Error('Strudel initialization failed: ' + error.message);
        }
    }

    async initMIDI() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.midiOutputs = Array.from(this.midiAccess.outputs.values());
            const midiSelect = document.getElementById('midi-output');
            midiSelect.innerHTML = '<option value="">Select MIDI Output</option>';
            this.midiOutputs.forEach(output => {
                const option = document.createElement('option');
                option.value = output.id;
                option.textContent = output.name;
                midiSelect.appendChild(option);
            });
            midiSelect.addEventListener('change', (e) => {
                this.midiOutput = this.midiAccess.outputs.get(e.target.value);
                this.midiEnabled = !!this.midiOutput;
                this.showNotification(this.midiEnabled ? `MIDI Output: ${this.midiOutput.name}` : 'MIDI Output disabled', 'success');
            });
            this.midiAccess.onstatechange = () => this.updateMIDIOutputs();
        } catch (error) {
            console.error('MIDI initialization failed:', error);
            this.showNotification('MIDI not supported or access denied', 'error');
        }
    }

    updateMIDIOutputs() {
        this.midiOutputs = Array.from(this.midiAccess.outputs.values());
        const midiSelect = document.getElementById('midi-output');
        midiSelect.innerHTML = '<option value="">Select MIDI Output</option>';
        this.midiOutputs.forEach(output => {
            const option = document.createElement('option');
            option.value = output.id;
            option.textContent = output.name;
            midiSelect.appendChild(option);
        });
    }

    // Reuse methods from main.js
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
        this.mixedPatterns = JSON.parse(JSON.stringify(state.mixedPatterns || { tracks: {}, saved: {} }));
        this.synthParams = JSON.parse(JSON.stringify(state.synthParams));
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = state.code || '';
        this.getTracks().forEach(track => {
            const stepsEl = document.getElementById(`${track}-steps`);
            if (stepsEl) stepsEl.value = this.trackStates[track].steps;
            const soundEl = document.getElementById(`${track}-sound`);
            if (soundEl) soundEl.value = this.trackStates[track].sound;
            this.updateSequencerUI(track);
            this.updateButtonState(`mute-${track}`, this.trackStates[track].muted);
            this.updateButtonState(`solo-${track}`, this.trackStates[track].solo);
            this.updateButtonState(`mix-${track}`, !!this.mixedPatterns.tracks[track]);
        });
        this.updatePatternBankUI();
        this.updateUndoRedoButtons();
        this.saveToLocalStorage();
    }

    updateButtonState(buttonId, isActive) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive);
        }
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
        const trackName = `NOTE ${track.toUpperCase()}`;
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
                <select class="sound-selector" id="${track}-sound" aria-label="Select MIDI note for ${trackName.toLowerCase()}">
                    <option value="C4">C4</option>
                    <option value="D4">D4</option>
                    <option value="E4">E4</option>
                    <option value="F4">F4</option>
                    <option value="G4">G4</option>
                    <option value="A4">A4</option>
                    <option value="B4">B4</option>
                </select>
                <button class="cyber-btn" id="random-${track}" aria-label="Randomize ${trackName.toLowerCase()} track"><i class="las la-dice"></i> Randomize</button>
                <button class="cyber-btn" id="generate-${track}" aria-label="Generate code for ${trackName.toLowerCase()} track"><i class="las la-code"></i> Generate</button>
            </div>
        `;
        wrapper.appendChild(container);
        document.getElementById(`${track}-steps`).value = this.trackStates[track].steps;
        document.getElementById(`${track}-sound`).value = this.trackStates[track].sound;
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
        if (removeTrackBtn) removeTrackBtn.style.display = this.getTracks().length > 1 ? 'inline-flex' : 'none';
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
            this.trackStates[track].sound = e.target.value;
            if (this.mixedPatterns.tracks[track]) {
                this.updateMixedCode();
            }
            this.saveToLocalStorage();
        });
    }

    toggleMute(track) {
        this.trackStates[track].muted = !this.trackStates[track].muted;
        this.updateButtonState(`mute-${track}`, this.trackStates[track].muted);
        this.updateSequencerUI(track);
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
    }

    toggleSolo(track) {
        this.trackStates[track].solo = !this.trackStates[track].solo;
        this.updateButtonState(`solo-${track}`, this.trackStates[track].solo);
        this.getTracks().forEach(t => this.updateSequencerUI(t));
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
    }

    mixTrack(track) {
        this.mixedPatterns.tracks[track] = !this.mixedPatterns.tracks[track];
        this.updateButtonState(`mix-${track}`, this.mixedPatterns.tracks[track]);
        this.updateMixedCode();
        this.saveToLocalStorage();
    }

    randomizeTrack(track) {
        this.saveToHistory();
        const steps = this.trackStates[track].steps;
        this.sequencerState[track] = Array(steps).fill(false).map(() => Math.random() > 0.5);
        this.updateSequencerUI(track);
        if (this.mixedPatterns.tracks[track]) {
            this.updateMixedCode();
        }
        this.saveToLocalStorage();
    }

    generateTrackCode(track) {
        const steps = this.sequencerState[track];
        const sound = this.trackStates[track].sound;
        const pattern = steps.map((active, i) => active ? sound : '~').join(' ');
        const code = `note("${pattern}").midi()`;
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) {
            codeEditor.value = code;
            this.evaluateCode();
        }
        this.showNotification(`Generated code for ${track}`, 'success');
    }

    updateMixedCode() {
        let code = '';
        const tracks = Object.keys(this.mixedPatterns.tracks).filter(t => this.mixedPatterns.tracks[t]);
        tracks.forEach(track => {
            const steps = this.sequencerState[track];
            const sound = this.trackStates[track].sound;
            const pattern = steps.map((active, i) => active ? sound : '~').join(' ');
            code += `note("${pattern}").midi()\n`;
        });
        Object.keys(this.mixedPatterns.saved).forEach(name => {
            if (this.mixedPatterns.saved[name]) {
                const pattern = this.savedPatterns.get(name);
                if (pattern && pattern.code) {
                    code += `${pattern.code}\n`;
                }
            }
        });
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) codeEditor.value = code;
    }

    evaluateCode() {
        if (!this.strudelReady) {
            this.showNotification('Strudel not ready', 'error');
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
            this.strudelAPI.evaluate(code);
            if (this.midiOutput) {
                this.strudelAPI.onNote((note, velocity, duration) => {
                    const midiNote = this.noteToMidiNumber(note);
                    this.midiOutput.send([0x90, midiNote, velocity]); // Note On
                    setTimeout(() => {
                        this.midiOutput.send([0x80, midiNote, 0]); // Note Off
                    }, duration * 1000);
                });
            }
            this.isPlaying = true;
            document.body.classList.add('playing');
            this.showNotification('Code evaluated successfully', 'success');
        } catch (error) {
            this.showNotification(`Evaluation failed: ${error.message}`, 'error');
        }
    }

    noteToMidiNumber(note) {
        const noteMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
        const matches = note.match(/([A-G]#?)(\d)/);
        if (!matches) return 60; // Default to C4
        const [, noteName, octave] = matches;
        return noteMap[noteName] + (parseInt(octave) + 1) * 12;
    }

    stopCode() {
        if (this.strudelAPI) {
            this.strudelAPI.stop();
            this.isPlaying = false;
            document.body.classList.remove('playing');
            this.showNotification('Playback stopped', 'success');
        }
    }

    clearCode() {
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) {
            codeEditor.value = '';
            this.mixedPatterns.tracks = {};
            this.getTracks().forEach(track => {
                this.updateButtonState(`mix-${track}`, false);
            });
            this.updateMixedCode();
            this.saveToHistory();
            this.saveToLocalStorage();
            this.showNotification('Code cleared', 'success');
        }
    }

    async generateAICode() {
        const promptEl = document.getElementById('ai-prompt');
        if (!promptEl) {
            this.showNotification('AI prompt not found', 'error');
            return;
        }
        const prompt = promptEl.value.trim();
        if (!prompt) {
            this.showNotification('Please enter a prompt', 'error');
            return;
        }
        try {
            const response = await fetch('https://api.x.ai/grok/code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAPIKey()}`
                },
                body: JSON.stringify({ prompt: `Generate Strudel code for a MIDI pattern: ${prompt}` })
            });
            const data = await response.json();
            const codeEditor = document.getElementById('code-editor');
            if (codeEditor && data.code) {
                codeEditor.value = data.code;
                this.evaluateCode();
                this.saveToHistory();
                this.showNotification('AI-generated code loaded', 'success');
            } else {
                this.showNotification('No code generated', 'error');
            }
        } catch (error) {
            this.showNotification(`AI generation failed: ${error.message}`, 'error');
        }
    }

    getAPIKey() {
        // Assuming API_KEY is stored in a global config or environment
        return window.API_KEY || 'YOUR_API_KEY'; // Replace with actual API key management
    }

    savePattern() {
        const nameInput = document.getElementById('pattern-name');
        if (!nameInput || !nameInput.value.trim()) {
            this.showNotification('Please enter a pattern name', 'error');
            return;
        }
        const name = nameInput.value.trim();
        if (this.savedPatterns.has(name)) {
            this.showNotification(`Pattern "${name}" already exists`, 'error');
            return;
        }
        this.savedPatterns.set(name, {
            sequencerState: JSON.parse(JSON.stringify(this.sequencerState)),
            trackStates: JSON.parse(JSON.stringify(this.trackStates)),
            synthParams: JSON.parse(JSON.stringify(this.synthParams)),
            code: document.getElementById('code-editor')?.value || ''
        });
        nameInput.value = '';
        this.updatePatternBankUI();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Pattern "${name}" saved`, 'success');
    }

    updatePatternBankUI() {
        const patternBank = document.getElementById('pattern-bank');
        if (!patternBank) return;
        patternBank.innerHTML = '';
        this.savedPatterns.forEach((pattern, name) => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <div>
                    <button class="cyber-btn" id="load-saved-${name}" aria-label="Load pattern ${name}"><i class="las la-play"></i> Load</button>
                    <button class="cyber-btn" id="mix-saved-${name}" aria-label="Mix pattern ${name}"><i class="las la-random"></i> Mix</button>
                    <button class="cyber-btn" id="delete-saved-${name}" aria-label="Delete pattern ${name}"><i class="las la-trash"></i></button>
                </div>
            `;
            patternBank.appendChild(div);
            document.getElementById(`load-saved-${name}`).addEventListener('click', () => this.loadPattern(name));
            document.getElementById(`mix-saved-${name}`).addEventListener('click', () => this.mixSavedPattern(name));
            document.getElementById(`delete-saved-${name}`).addEventListener('click', () => this.deletePattern(name));
        });
    }

    loadPattern(name) {
        const pattern = this.savedPatterns.get(name);
        if (!pattern) {
            this.showNotification(`Pattern "${name}" not found`, 'error');
            return;
        }
        this.restoreState(pattern);
        this.evaluateCode();
        this.showNotification(`Pattern "${name}" loaded`, 'success');
    }

    mixSavedPattern(name) {
        this.mixedPatterns.saved[name] = !this.mixedPatterns.saved[name];
        this.updateButtonState(`mix-saved-${name}`, this.mixedPatterns.saved[name]);
        this.updateMixedCode();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Saved pattern "${name}" ${this.mixedPatterns.saved[name] ? 'mixed' : 'removed'}`, 'success');
    }

    deletePattern(name) {
        if (!this.savedPatterns.has(name)) {
            this.showNotification(`Pattern "${name}" not found`, 'error');
            return;
        }
        this.mixedPatterns.saved[name] = false;
        this.updateButtonState(`mix-saved-${name}`, false);
        this.savedPatterns.delete(name);
        delete this.mixedPatterns.saved[name];
        this.updatePatternBankUI();
        this.updateMixedCode();
        this.saveToHistory();
        this.saveToLocalStorage();
        this.showNotification(`Pattern "${name}" deleted`, 'success');
    }

    saveToLocalStorage() {
        const state = {
            sequencerState: this.sequencerState,
            trackStates: this.trackStates,
            mixedPatterns: this.mixedPatterns,
            savedPatterns: [...this.savedPatterns],
            synthParams: this.synthParams,
            code: document.getElementById('code-editor')?.value || ''
        };
        try {
            localStorage.setItem('cybermidi_state', JSON.stringify(state));
            console.log('State saved to localStorage');
        } catch (error) {
            console.error('Failed to save to local storage:', error);
            this.showNotification('Failed to save state to local storage', 'error');
        }
    }

    loadSavedData() {
        try {
            const saved = localStorage.getItem('cybermidi_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.restoreState(parsed);
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
        notification.innerHTML = `
            <span id="notification-text">${message}</span>
            <button aria-label="Close notification">Close</button>
        `;
        notification.className = `notification ${type}`;
        notification.style.display = 'flex';
        notification.querySelector('button').addEventListener('click', () => {
            notification.style.display = 'none';
        });
        notification.focus();
    }

    setupEventListeners() {
        document.getElementById('play-btn')?.addEventListener('click', () => this.evaluateCode());
        document.getElementById('stop-btn')?.addEventListener('click', () => this.stopCode());
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());
        document.getElementById('clear-code-btn')?.addEventListener('click', () => this.clearCode());
        document.getElementById('save-code-btn')?.addEventListener('click', () => this.saveCode());
        document.getElementById('load-code-btn')?.addEventListener('click', () => this.loadCode());
        document.getElementById('add-track')?.addEventListener('click', () => this.addTrack());
        document.getElementById('remove-track')?.addEventListener('click', () => this.removeTrack());
        document.getElementById('sequencer-random')?.addEventListener('click', () => this.randomizeAll());
        document.getElementById('sequencer-clear')?.addEventListener('click', () => this.clearAll());
        document.getElementById('sequencer-generate')?.addEventListener('click', () => this.generateAllCode());
        document.getElementById('save-pattern-btn')?.addEventListener('click', () => this.savePattern());
        document.getElementById('export-patterns-btn')?.addEventListener('click', () => this.exportPatterns());
        document.getElementById('import-patterns-btn')?.addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file')?.addEventListener('change', (e) => this.importPatterns(e));
        document.getElementById('generate-ai-btn')?.addEventListener('click', () => this.generateAICode());
        document.getElementById('bpm')?.addEventListener('input', (e) => {
            this.synthParams.bpm = parseInt(e.target.value);
            document.getElementById('bpm-value').textContent = this.synthParams.bpm;
            if (this.strudelAPI && this.synthParams.bpmEnabled) {
                this.strudelAPI.setCps(this.synthParams.bpm / 60 / 4);
            }
            this.saveToHistory();
            this.saveToLocalStorage();
        });
        document.getElementById('bpm-enable')?.addEventListener('change', (e) => {
            this.synthParams.bpmEnabled = e.target.checked;
            if (this.strudelAPI && this.synthParams.bpmEnabled) {
                this.strudelAPI.setCps(this.synthParams.bpm / 60 / 4);
            }
            this.saveToHistory();
            this.saveToLocalStorage();
        });
    }

    addTrack() {
        this.saveToHistory();
        const trackId = `note${Object.keys(this.sequencerState).length + 1}`;
        this.sequencerState[trackId] = Array(8).fill(false);
        this.trackStates[trackId] = { muted: false, solo: false, steps: 8, sound: 'C4' };
        this.recreateSequencer();
        this.saveToLocalStorage();
        this.showNotification(`Track ${trackId} added`, 'success');
    }

    removeTrack() {
        this.saveToHistory();
        const tracks = this.getTracks();
        if (tracks.length <= 1) {
            this.showNotification('Cannot remove the last track', 'error');
            return;
        }
        const lastTrack = tracks[tracks.length - 1];
        delete this.sequencerState[lastTrack];
        delete this.trackStates[lastTrack];
        delete this.mixedPatterns.tracks[lastTrack];
        this.recreateSequencer();
        this.updateMixedCode();
        this.saveToLocalStorage();
        this.showNotification(`Track ${lastTrack} removed`, 'success');
    }

    randomizeAll() {
        this.saveToHistory();
        this.getTracks().forEach(track => this.randomizeTrack(track));
        this.showNotification('All tracks randomized', 'success');
    }

    clearAll() {
        this.saveToHistory();
        this.getTracks().forEach(track => {
            this.sequencerState[track] = Array(this.trackStates[track].steps).fill(false);
            this.updateSequencerUI(track);
        });
        this.mixedPatterns.tracks = {};
        this.getTracks().forEach(track => this.updateButtonState(`mix-${track}`, false));
        this.updateMixedCode();
        this.saveToLocalStorage();
        this.showNotification('All tracks cleared', 'success');
    }

    generateAllCode() {
        let code = '';
        this.getTracks().forEach(track => {
            const steps = this.sequencerState[track];
            const sound = this.trackStates[track].sound;
            const pattern = steps.map((active, i) => active ? sound : '~').join(' ');
            code += `note("${pattern}").midi()\n`;
        });
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor) {
            codeEditor.value = code;
            this.evaluateCode();
        }
        this.showNotification('Generated code for all tracks', 'success');
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
        a.download = 'cybermidi_code.txt';
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
                this.mixedPatterns.tracks = {};
                this.getTracks().forEach(track => this.updateButtonState(`mix-${track}`, false));
                this.updateMixedCode();
                this.evaluateCode();
                this.saveToHistory();
                this.saveToLocalStorage();
                this.showNotification('Code loaded', 'success');
            };
            reader.readAsText(file);
        };
        input.click();
    }

    exportPatterns() {
        const arr = Array.from(this.savedPatterns.entries());
        const data = JSON.stringify(arr, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cybermidi_patterns.json';
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
}

const app = new CyberMidi();
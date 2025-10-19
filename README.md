# CyberSynth Strudel 🎹⚡

![CyberSynth Banner](https://via.placeholder.com/1200x300/00ffff/000000?text=CyberSynth+Strudel+-+Advanced+Live+Coding+Music+Studio)  
*(A cyberpunk-inspired live coding music studio where code meets beats in a neon-lit grid.)*

## 🚀 Overview

**CyberSynth Strudel** is an advanced, browser-based live coding music studio powered by [Strudel](https://strudel.cc/) (the web-friendly evolution of TidalCycles). Dive into algorithmic music creation with a sleek, cyberpunk aesthetic: blend visual sequencers, real-time code editing, synth controls, pattern banks, and seamless mixing to craft everything from techno rhythms to ambient glitches. No setup required—just open your browser and start jamming.

Perfect for musicians, coders, and sound artists who want to code their soundscapes on the fly. Inspired by the future of music: where syntax is symphony.

## ✨ Key Features

- **Interactive Sequencer**: Drag-and-drop beats across 4 default tracks (Kick, Snare, Hi-Hat, Clap). Customize steps (4/8/16), sounds, and randomize for instant grooves.
- **Live Code Editor**: Write Strudel/TidalCycles patterns with syntax highlighting. Evaluate code in real-time (Ctrl+Enter) and layer with `stack()`, `cat()`, or effects like `rev()` and `jux()`.
- **Synth & Effects Controls**: Tweak LPF/LPQ filters, reverb (room), delay, and BPM (60-200). Apply directly to code or mix globally.
- **Pattern Bank**: Save, load, export/import patterns as JSON. Mix presets (A-L) or custom saves effortlessly.
- **Pattern Mixer**: Stack tracks, presets, and saved patterns with one click. Add randomness or combine for complex polyrhythms.
- **Undo/Redo & Persistence**: Full history tracking and localStorage saves—your session lives on.
- **Visualizers & Transport**: Scope/spectrum views, play/stop, and responsive cyber-grid animations for that immersive vibe.
- **Mobile-Responsive**: Works on desktops, tablets, and phones—code anywhere.

| Feature | Description | Pro Tip |
|---------|-------------|---------|
| **Sequencer** | Visual beat-making | Generate code from patterns to bridge GUI & code. |
| **Code Editor** | Real-time Strudel eval | Use `hush()` to silence previous layers. |
| **Synth FX** | Filters + spatial effects | Chain with `.lpf(sine.range(200,2000))` for acid bass. |
| **Pattern Bank** | Save/load JSON | Export for backups; import to collaborate. |
| **Mixer** | Layer everything | Randomize 3 patterns for glitch-hop surprises. |

## 🎼 Quick Start

1. **Clone or Download**: 
   ```
   git clone https://github.com/yourusername/cybersynth-strudel.git
   cd cybersynth-strudel
   ```

2. **Run Locally** (No server needed!):
   - Open `index.html` in any modern browser (Chrome/Firefox recommended for Web Audio).
   - Audio will prompt for mic access—allow it for full playback.

3. **First Jam**:
   - Hit **Play** to start the transport.
   - Toggle steps in the sequencer for a basic beat.
   - Paste this into the code editor and hit **Evaluate**:
     ```javascript
     hush();  // Clear previous sounds
     setCps(120 / 60 / 4);  // 120 BPM
     stack(
       sound("bd*4"),  // Steady kick
       sound("~ sd ~ sd"),  // Off-beat snare
       note("c3 eb3 g3 bb3").sound("sawtooth").lpf(800)  // Acid bassline
     ).room(0.3).jux(rev);  // Reverb + stereo reverse
     ```
   - Tweak BPM slider and add reverb—watch the grid pulse!

For production, serve via `npx serve` or any static host (e.g., GitHub Pages).

## 📖 Examples

### Techno Groove (Sequencer + Code)
Build a 4/4 kick in the sequencer, then generate code:
```javascript
stack(
  sound("bd*4"),  // From Kick track
  sound("hh*8").gain(0.3),  // Hi-hats
  sound("~ ~ sd ~")  // Snare on 3
).lpf(sine.range(400, 2000).slow(4));  // Sweeping filter
```

### Ambient Pad (Presets + Effects)
Load Preset D (Melody), mix with synth controls:
```javascript
note("<c4 e4 g4 b4>").sound("triangle")
  .slow(4)
  .room(0.9)  // Heavy reverb
  .delay(0.5)
  .gain(0.3)
  .lpf(600);  // Low-pass warmth
```

### Glitch Hop (Random Mix)
Hit "Random 3" in Mixer, then tweak:
```javascript
stack(
  sound("bd*2").sometimes(x => x.speed(2)),
  sound("hh*8").sometimesBy(0.3, x => x.rev()),
  note("c2 ~ eb2").sound("sawtooth").euclid(3,8)
).every(4, x => x.jux(rev));
```

Save as a pattern, export, and share!

## 🛠️ Tech Stack

- **Core**: Strudel (Web Audio + TidalCycles patterns)
- **UI**: Vanilla JS, CSS Grid/Flexbox, Line Awesome icons
- **Fonts**: Orbitron (cyberpunk vibes), Fira Code (code clarity)
- **Storage**: localStorage for sessions; JSON for patterns
- **Responsive**: Mobile-first with media queries

No dependencies—pure browser magic. Contributions welcome via PRs!

## 📚 Resources & Tutorials

- [Strudel Docs](https://strudel.cc/learn/) – Deep dive into patterns.
- [TidalCycles Book](https://tidalcycles.org/docs/) – Algorithmic composition theory.
- [Tutorial](tutorial.html) – Persian/English guide (in-repo).
- Join the [Strudel Discord](https://discord.gg/strudel) for live jams.

## 🤝 Contributing

1. Fork the repo.
2. Create a feature branch (`git checkout -b feature/cool-fx`).
3. Commit changes (`git commit -m "Add glitch mode"`).
4. Push & PR—let's synth the future!

Issues? Open one. Ideas? Ping me.

## 📄 License

MIT License – Free to remix, just credit the vibes. See [LICENSE](LICENSE) for details.

---

**Built with ❤️ for the live coding revolution. Code your sound. Sound your code. – October 2025**  

⭐ Star if it sparks joy! 🚀

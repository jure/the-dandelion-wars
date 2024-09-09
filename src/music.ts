export default class Music {
  private audioContext: AudioContext;
  private isPlaying = false;
  private tempo = 70; // Slightly faster, but still relaxed
  private currentTime = 0;
  private nextNoteTime = 0;
  private timerID: number | null = null;
  private currentChord = 0;
  private currentSection: "A" | "B" = "A";
  private sectionCounter = 0;

  private chords = [
    { root: "Am", chord: ["A3", "C4", "E4"] },
    { root: "Dm", chord: ["D4", "F4", "A4"] },
    { root: "F4", chord: ["F3", "A3", "C4"] },
    { root: "G4", chord: ["G3", "B3", "D4"] },
  ];

  private melodyPatternA = [
    { note: "E4", duration: 1 },
    { note: "A4", duration: 0.5 },
    { note: "C5", duration: 0.5 },
    { note: "B4", duration: 1 },
    { note: "G4", duration: 1 },
  ];

  private melodyPatternB = [
    { note: "C5", duration: 0.5 },
    { note: "B4", duration: 0.5 },
    { note: "A4", duration: 1 },
    { note: "F4", duration: 0.5 },
    { note: "G4", duration: 1.5 },
  ];

  private reverb!: ConvolverNode;
  private filter!: BiquadFilterNode;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this._setupEffects();
  }

  private _setupEffects(): void {
    this.reverb = this.audioContext.createConvolver();
    this.reverb.buffer = this._createReverbIR(2, 2.5);

    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 2000; // Slightly higher for more clarity
    this.filter.Q.value = 0.5;
  }

  private _createReverbIR(duration: number, decay: number): AudioBuffer {
    const length = this.audioContext.sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }

    return impulse;
  }

  private noteToFrequency(note: string): number {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = parseInt(note.slice(-1));
    const semitone = notes.indexOf(note.slice(0, -1));
    return 440 * Math.pow(2, (semitone - 9) / 12 + (octave - 4));
  }

  private createOscillator(
    type: OscillatorType,
    frequency: number,
    start: number,
    duration: number,
    gain = 0.5,
  ): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.connect(gainNode);

    gainNode.connect(this.filter);
    this.filter.connect(this.reverb);
    this.reverb.connect(this.audioContext.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);

    const attack = 0.05;
    const decay = duration * 0.3;
    const sustain = 0.6;
    const release = duration * 0.3;

    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(gain, start + attack);
    gainNode.gain.linearRampToValueAtTime(sustain * gain, start + attack + decay);
    gainNode.gain.setValueAtTime(sustain * gain, start + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, start + duration);

    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  private playNote(note: string, start: number, duration: number, gain = 0.5): void {
    this.createOscillator("sine", this.noteToFrequency(note), start, duration, gain);
  }

  private playChord(chord: string[], start: number, duration: number): void {
    chord.forEach((note) => {
      this.createOscillator("sine", this.noteToFrequency(note), start, duration, 0.15);
    });
  }

  private playDrum(type: "kick" | "snare", time: number): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    if (type === "kick") {
      oscillator.frequency.setValueAtTime(100, time);
      oscillator.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
      gainNode.gain.setValueAtTime(0.7, time);
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    } else if (type === "snare") {
      oscillator.frequency.setValueAtTime(100, time);
      gainNode.gain.setValueAtTime(0.2, time);
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

      const noise = this.audioContext.createBufferSource();
      const noiseGain = this.audioContext.createGain();
      const noiseFilter = this.audioContext.createBiquadFilter();
      noise.buffer = this._noiseBuffer();
      noiseFilter.type = "highpass";
      noiseFilter.frequency.value = 1000;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.audioContext.destination);
      noiseGain.gain.setValueAtTime(0.2, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noise.start(time);
    }

    oscillator.start(time);
    oscillator.stop(time + 0.5);
  }

  private _noiseBuffer(): AudioBuffer {
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  private scheduleNote(): void {
    const secondsPerBeat = 60.0 / this.tempo;

    while (this.nextNoteTime < this.audioContext.currentTime + 0.1) {
      const currentBeat = this.currentTime % 4;

      if (currentBeat === 0) {
        this.currentChord = (this.currentChord + 1) % this.chords.length;
        this.sectionCounter++;
        if (this.sectionCounter % 8 === 0) {
          this.currentSection = this.currentSection === "A" ? "B" : "A";
        }
      }

      // Play chord
      this.playChord(this.chords[this.currentChord].chord, this.nextNoteTime, secondsPerBeat * 2);

      // Play melody
      const melodyPattern = this.currentSection === "A" ? this.melodyPatternA : this.melodyPatternB;
      const melodyNote = melodyPattern[Math.floor(currentBeat) % melodyPattern.length];
      this.playNote(melodyNote.note, this.nextNoteTime, melodyNote.duration * secondsPerBeat, 0.3);

      // Play drums
      if (currentBeat === 0) {
        this.playDrum("kick", this.nextNoteTime);
      } else if (currentBeat === 2) {
        this.playDrum("snare", this.nextNoteTime);
      }

      this.currentTime += 0.5;
      this.nextNoteTime += 0.5 * secondsPerBeat;
    }

    this.timerID = window.setTimeout(() => this.scheduleNote(), 25);
  }

  public start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentTime = 0;
    this.nextNoteTime = this.audioContext.currentTime;
    this.currentChord = 0;
    this.currentSection = "A";
    this.sectionCounter = 0;
    // this.scheduleNote();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerID !== null) {
      clearTimeout(this.timerID);
    }
  }
}

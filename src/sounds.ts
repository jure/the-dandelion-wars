const gsound = (e: number, V: number) => {
  // Synth adapted from Xem's Minisynth
  const D = [];
  for (let i = 0; i < 44100 * V; i++) {
    // V: note length in seconds
    // This function generates the i'th sample of a sinusoidal signal with a specific frequency and amplitude
    const b = (e: number, t: number, a: number, i: number) => Math.sin((e / t) * 6.28 * a + i);
    // Instrument synthesis
    const w = (e: number, t: number) =>
      Math.sin(
        (e / 44100) * t * 6.28 +
          b(e, 44100, t, 0) ** 3 +
          0.75 * b(e, 44100, t, 0.25) +
          0.1 * b(e, 44100, t, 0.5),
      );

    // Fill the samples array
    D[i] =
      // The first 88 samples represent the note's attack
      i < 88
        ? (i / 88.2) * w(i, e)
        : // The other samples represent the rest of the note
          (1 - (i - 88.2) / (44100 * (V - 0.002))) ** ((0.5 * Math.log((1e4 * e) / 44100)) ** 2) *
          w(i, e);
  }
  return D;
};
const ac = new window.AudioContext();

const now = Date.now();

const getBuffer = (D: any[]) => {
  const e = ac.createBufferSource();
  const f = ac.createBuffer(1, D.length, 44100);
  f.getChannelData(0).set(D);
  e.buffer = f;
  return e;
};

// Frequencies for one octave
const frequencies = [261, 277, 293, 311, 329, 349, 369, 392, 415, 440].map((f) => f / 4);
// Generate three octaves

const sounds: AudioBufferSourceNode[] = [];
for (let i = -1; i < 3; i++) {
  sounds.push(...frequencies.map((f) => getBuffer(gsound(f * Math.pow(2, i), 0.1))));
}

let positionalPoolIndex = 0;

// export function playSound(note: number) {

// }

export function playSoundAtPosition(
  player: "p" | "e",
  position: THREE.Vector3,
  positionalPool: {
    e: THREE.PositionalAudio[];
    p: THREE.PositionalAudio[];
  },
  note: number,
) {
  // Connect to positional audio
  // Only start playing on regular interval
  // const positionalAudio =
  //   positionalPool[player][positionalPoolIndex++ % positionalPool[player].length];

  // Is any positional audio playing?
  // const playing = positionalPool[player].some((p) => p["isPlaying"]);
  // if (!playing) {
  setTimeout(
    () => {
      const positionalAudio =
        positionalPool[player][positionalPoolIndex++ % positionalPool[player].length];

      // Is any positional audio playing?
      const playing = positionalAudio["isPlaying"];
      if (!playing) {
        positionalAudio.position.copy(position);
        const source = sounds[note];
        source.buffer && positionalAudio["setBuffer"](source.buffer);
        positionalAudio.play();
      }
    },
    50 - ((Date.now() - now) % 50),
  );
  // }
}

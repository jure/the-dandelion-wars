// /* eslint-disable */
class WaveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      this.envelopes = eval(event.data);
    };
  }
  process(inputs, outputs) {
    // const input = inputs[0];
    const output = outputs[0];
    // const nodeBufferSize = 1024; // or whatever your buffer size is
    // const sampleRate = this.contextInfo.sampleRate;

    output.forEach((channel) => {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1; // White noise
        if (this.envelopes) {
          const c = currentTime; // eslint-disable-line
          const s = sampleRate; // eslint-disable-line

          channel[i] *= 0.2 * (0.1 * this.envelopes(i, c, s)[0] + 0.1 * this.envelopes(i, c, s)[1]);
        }
      }
    });

    return true;
  }
}

registerProcessor("waveProcessor", WaveProcessor);

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.3
) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

export function playNightChime() {
  playTone(440, 1.5, "sine", 0.2);
  setTimeout(() => playTone(330, 1.5, "sine", 0.15), 300);
  setTimeout(() => playTone(262, 2, "sine", 0.1), 600);
}

export function playDawnChime() {
  playTone(262, 0.8, "sine", 0.2);
  setTimeout(() => playTone(330, 0.8, "sine", 0.2), 200);
  setTimeout(() => playTone(392, 0.8, "sine", 0.2), 400);
  setTimeout(() => playTone(523, 1.2, "sine", 0.25), 600);
}

export function playVoteSound() {
  playTone(200, 0.15, "square", 0.1);
}

export function playEliminationSound() {
  playTone(220, 0.5, "sawtooth", 0.15);
  setTimeout(() => playTone(185, 0.5, "sawtooth", 0.12), 300);
  setTimeout(() => playTone(147, 1, "sawtooth", 0.1), 600);
}

export function playVictorySound() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.4, "sine", 0.2), i * 200);
  });
}

export function playTickSound() {
  playTone(800, 0.05, "square", 0.05);
}

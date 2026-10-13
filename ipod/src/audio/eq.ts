/** Preset dell'equalizzatore a 10 bande (dB), ricalcano quelli di iTunes/iPod. */
import type { EqPreset } from '../core/settings'

export const EQ_BANDS_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

export const EQ_GAINS: Record<EqPreset, readonly number[]> = {
  off: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  acoustic: [5, 5, 4, 1, 2, 2, 3.5, 4, 3.5, 2],
  bassBooster: [5.5, 4.5, 3.5, 2.5, 1.2, 0, 0, 0, 0, 0],
  bassReducer: [-5.5, -4.5, -3.5, -2.5, -1.2, 0, 0, 0, 0, 0],
  classical: [4.5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2.5, 3.5, 4],
  dance: [3.5, 6.5, 5, 0, 2, 3.5, 5, 4.5, 3.5, 0],
  deep: [5, 3.5, 2, 1, 3, 2.5, 1.5, -2, -3.5, -4.5],
  electronic: [4.5, 4, 1.2, 0, -2, 2, 1, 1.2, 4, 5],
  hipHop: [5, 4, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3],
  jazz: [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 4],
  latin: [4.5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 4.5],
  loudness: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1],
  lounge: [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1],
  piano: [3, 2, 0, 2.5, 3, 1.5, 3.5, 4.5, 3, 3.5],
  pop: [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5],
  rnb: [2.5, 7, 5.5, 1.5, -2, -1.5, 2.5, 3, 3, 3.5],
  rock: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5],
  smallSpeakers: [5.5, 4.5, 3.5, 2.5, 1.2, 0, -1.2, -2.5, -3.5, -4.5],
  spokenWord: [-3.5, -0.5, 0, 0.5, 3.5, 4.5, 4.5, 4.5, 2.5, 0],
  trebleBooster: [0, 0, 0, 0, 0, 1.2, 2.5, 3.5, 4.5, 5.5],
  trebleReducer: [0, 0, 0, 0, 0, -1.2, -2.5, -3.5, -4.5, -5.5],
  vocalBooster: [-1.5, -3, -3, 1.5, 3.5, 3.5, 3, 1.5, 0, -1.5],
}

/** Catena di filtri collegata a un elemento audio. Creata una sola volta per elemento. */
export class EqChain {
  private filters: BiquadFilterNode[] = []
  readonly input: AudioNode
  readonly output: GainNode
  constructor(ac: AudioContext) {
    this.output = ac.createGain()
    let prev: AudioNode | null = null
    for (const hz of EQ_BANDS_HZ) {
      const f = ac.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = hz
      f.Q.value = 1.1
      f.gain.value = 0
      if (prev) prev.connect(f)
      this.filters.push(f)
      prev = f
    }
    this.input = this.filters[0]!
    prev!.connect(this.output)
  }
  apply(preset: EqPreset, at: number): void {
    const gains = EQ_GAINS[preset]
    this.filters.forEach((f, i) => {
      f.gain.cancelScheduledValues(at)
      f.gain.setTargetAtTime(gains[i] ?? 0, at, 0.02)
    })
  }
}

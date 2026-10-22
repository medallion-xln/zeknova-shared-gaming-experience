export const COMBAT_AUDIO_POLICY = Object.freeze({ maxVoices: 16, maxLayersPerEvent: 3, assetFilesAvailable: 0, source: "project-owned-procedural-synthesis" });
const PROFILES = Object.freeze({ normal:{frequencies:[310],duration:.045,gain:.012},heavy:{frequencies:[125,260],duration:.075,gain:.016},kill:{frequencies:[110,170,340],duration:.11,gain:.014},boss:{frequencies:[82,205],duration:.07,gain:.014},"boss-stagger":{frequencies:[58,116,232],duration:.13,gain:.017},defense:{frequencies:[420,620],duration:.06,gain:.01},player:{frequencies:[72,92],duration:.08,gain:.015},phase:{frequencies:[55,110,220],duration:.18,gain:.014} });

export class CombatAudioDirector {
  constructor({ windowRef = globalThis } = {}) { this.window = windowRef; this.voices = new Set(); this.events = []; this.peakVoices = 0; }
  play(event) {
    const AudioContext = this.window?.AudioContext || this.window?.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      this.context ||= new AudioContext(); if (this.context.state !== "running") return false;
      const role = event.target === "player" ? "player" : event.kind || "normal", profile = PROFILES[role] || PROFILES.normal;
      let layers = 0;
      for (const frequency of profile.frequencies) {
        if (this.voices.size >= COMBAT_AUDIO_POLICY.maxVoices) break;
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = layers === 0 ? "triangle" : layers === 1 ? "sine" : "square";
        oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
        gain.gain.setValueAtTime(profile.gain / profile.frequencies.length, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + profile.duration);
        oscillator.connect(gain).connect(this.context.destination); this.voices.add(oscillator); this.peakVoices = Math.max(this.peakVoices, this.voices.size);
        oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect?.(); gain.disconnect?.(); };
        oscillator.start(); oscillator.stop(this.context.currentTime + profile.duration); layers += 1;
      }
      this.events.push(Object.freeze({ id: event.id, role, layers })); if (this.events.length > 64) this.events.shift(); return layers > 0;
    } catch { return false; }
  }
  phase(id) { return this.play({ id, kind: "phase", target: "boss" }); }
  snapshot() { return Object.freeze({ activeVoices: this.voices.size, peakVoices: this.peakVoices, events: this.events.length, policy: COMBAT_AUDIO_POLICY }); }
  dispose() {
    const context = this.context; this.context = null;
    for (const voice of this.voices) { try { voice.stop?.(); } catch {} }
    this.voices.clear();
    if (context && context.state !== "closed") context.close?.()?.catch?.(() => {});
  }
}

export default CombatAudioDirector;

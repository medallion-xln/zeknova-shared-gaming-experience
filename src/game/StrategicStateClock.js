const CLOCK_ID = "zeknova-strategic-state-clock-v1";
const CLOCK_VERSION = 1;
const AUTHORITY = "none-no-live-command-execution";
const QUANTUM_SOURCE = "advisor-telemetry-tick";

function requireQuantum(value) {
  const quantum = Number(value);

  if (!Number.isSafeInteger(quantum) || quantum < 0) {
    throw new Error(
      "Strategic state quantum must be a non-negative safe integer."
    );
  }

  return quantum;
}

export class StrategicStateClock {
  constructor({ game } = {}) {
    if (!game) {
      throw new Error(
        "StrategicStateClock requires the live ZekNova game."
      );
    }

    this.game = game;
    this.lastQuantum = 0;
    this.installed = false;
  }

  readTelemetry() {
    if (
      typeof this.game.getAdvisorTelemetry !== "function"
    ) {
      throw new Error(
        "The live ZekNova runtime does not expose " +
        "getAdvisorTelemetry()."
      );
    }

    const telemetry = this.game.getAdvisorTelemetry();

    if (
      telemetry === null ||
      typeof telemetry !== "object" ||
      Array.isArray(telemetry)
    ) {
      throw new Error(
        "ZekNova advisor telemetry must be an object."
      );
    }

    return telemetry;
  }

  readRuntimeQuantum() {
    const telemetry = this.readTelemetry();

    return requireQuantum(telemetry.tick);
  }

  currentQuantum() {
    const quantum = this.readRuntimeQuantum();

    if (quantum < this.lastQuantum) {
      throw new Error(
        "Strategic state quantum regressed from " +
        this.lastQuantum +
        " to " +
        quantum +
        "."
      );
    }

    this.lastQuantum = quantum;

    return quantum;
  }

  snapshot() {
    return Object.freeze({
      id: CLOCK_ID,
      version: CLOCK_VERSION,
      quantum: this.currentQuantum(),
      quantumSource: QUANTUM_SOURCE,
      authority: AUTHORITY,
      liveCommandExecution: false,
      worldMutation: false,
    });
  }

  install() {
    if (this.installed) {
      return this;
    }

    this.currentQuantum();
    this.installed = true;
    globalThis.ZekNovaStrategicStateClock = this;

    if (globalThis.document?.documentElement) {
      document.documentElement.dataset.zeknovaStrategicStateClock =
        CLOCK_ID;
    }

    return this;
  }

  dispose() {
    if (
      globalThis.ZekNovaStrategicStateClock === this
    ) {
      delete globalThis.ZekNovaStrategicStateClock;
    }

    this.installed = false;

    return this;
  }
}

export const StrategicStateClockIdentity = Object.freeze({
  id: CLOCK_ID,
  version: CLOCK_VERSION,
  quantumSource: QUANTUM_SOURCE,
  authority: AUTHORITY,
  liveCommandExecution: false,
  worldMutation: false,
});

// Cross-cutting constants. No Electron imports here — this module is also
// loaded from `recover-transcript.js` outside of the Electron runtime.

const LANGUAGE_CODE = "en_uk";

const STATES = Object.freeze({
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  TRANSCRIPT_READY: "transcript-ready",
  ERROR: "error",
  INPERSON_RECORDING: "inperson-recording",
  INPERSON_PROCESSING: "inperson-processing",
  INPERSON_TRANSCRIPT_READY: "inperson-transcript-ready",
});

const INPERSON_CHANNELS = Object.freeze({
  START: "inperson-start",
  STOP: "inperson-stop",
  CHUNK: "inperson-chunk",
  TICK: "inperson-tick",
  HINT: "inperson-hint",
  STOPPED: "inperson-recorder-stopped",
  ERROR: "inperson-recorder-error",
});

module.exports = { LANGUAGE_CODE, STATES, INPERSON_CHANNELS };

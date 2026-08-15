const RecallAiSdk = require("@recallai/desktop-sdk").default;
const { saveTranscript } = require("./transcript");
const { getApiKey } = require("./settings");
const { buildKeyterms } = require("./keyterms");

const API_BASE = "https://eu-central-1.recall.ai";
const UNTITLED = "Untitled Meeting";
let currentRecording = null;
let trayCallbacks = null;
let getSettings = null;
let latestWindow = null;

async function init({ onStateChange, settingsLoader }) {
  trayCallbacks = onStateChange;
  getSettings = settingsLoader;

  console.log("[recall] Initialising SDK...");
  console.log("[recall] API key present:", !!getApiKey(getSettings()));

  try {
    RecallAiSdk.init({ api_url: API_BASE, acquirePermissionsOnStartup: [] });
    console.log("[recall] SDK init succeeded");
  } catch (err) {
    console.error("[recall] Failed to initialise Recall SDK:", err);
    trayCallbacks?.("error", "SDK init failed – check native binary");
    return;
  }

  RecallAiSdk.addEventListener("meeting-detected", handleMeetingDetected);
  RecallAiSdk.addEventListener("recording-ended", handleRecordingEnded);

  // Kept regardless of recording state, because this can arrive before
  // currentRecording exists – see docs/recall-sdk.md, "Window metadata arrives
  // after detection".
  RecallAiSdk.addEventListener("meeting-updated", (evt) => {
    latestWindow = evt.window;
    updateRecordingMetadata(evt.window);
  });

  // The title is passed because this can fire before handleMeetingDetected has
  // finished, and the tray keeps whatever it already has when given none.
  RecallAiSdk.addEventListener("recording-started", (evt) => {
    console.log("[recall] Recording started");
    if (evt?.window) {
      latestWindow = evt.window;
      updateRecordingMetadata(evt.window);
    }
    trayCallbacks?.("recording", currentRecording?.meetingTitle);
  });

  RecallAiSdk.addEventListener("permissions-granted", () => {
    console.log("[recall] All permissions granted");
  });

  // Diagnostic only – see docs/logging.md, "Checking permissions took effect".
  RecallAiSdk.addEventListener("permission-status", (evt) => {
    console.log(`[recall] Permission ${evt.permission}: ${evt.status}`);
  });

  registerDiagnosticListeners();

  // Sequential, and the accessibility request is deliberate – see
  // docs/recall-sdk.md, "Permissions".
  try {
    await RecallAiSdk.requestPermission("accessibility");
    console.log("[recall] Accessibility permission requested");
    await RecallAiSdk.requestPermission("microphone");
    console.log("[recall] Microphone permission requested");
    await RecallAiSdk.requestPermission("system-audio");
    console.log("[recall] System audio permission requested");
  } catch (err) {
    console.error("[recall] Permission request failed:", err);
  }
}

const SHUTDOWN_TIMEOUT_MS = 5000;

// Bounded, so a shutdown that never resolves can't leave an app that won't
// quit – see docs/recall-sdk.md, "Quitting".
async function shutdown() {
  let timer;
  try {
    await Promise.race([
      RecallAiSdk.shutdown(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${SHUTDOWN_TIMEOUT_MS}ms`)),
          SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
    console.log("[recall] SDK shut down cleanly");
  } catch (err) {
    console.warn("[recall] SDK shutdown incomplete:", err.message);
  } finally {
    // Also on the failure path – a pending timer would hold the quit open.
    clearTimeout(timer);
  }
}

// These listeners drive no behaviour; they exist so a failure leaves a cause in
// the log file – see docs/logging.md, "Diagnosing a failed recording".
function registerDiagnosticListeners() {
  RecallAiSdk.addEventListener("meeting-closed", (evt) => {
    console.log("[recall] Meeting closed:", JSON.stringify(evt.window));
    // Not purely diagnostic: on short calls this can be the first event
    // carrying a title.
    updateRecordingMetadata(evt.window);
  });

  RecallAiSdk.addEventListener("media-capture-status", (evt) => {
    console.log(
      `[recall] Media capture: type=${evt.type} capturing=${evt.capturing}`,
    );
  });

  RecallAiSdk.addEventListener("error", (evt) => {
    console.error(`[recall] SDK error (${evt.type}): ${evt.message}`);
  });

  RecallAiSdk.addEventListener("shutdown", (evt) => {
    console.error(
      `[recall] Native subprocess exited: code=${evt.code} signal=${evt.signal}`,
    );
  });

  // The SDK's native-side logs never pass through Electron's console, so
  // rerouting console.* doesn't capture them – see docs/logging.md.
  RecallAiSdk.addEventListener("log", (evt) => {
    const line = `[recall:${evt.subsystem}/${evt.category}] ${evt.message}`;
    if (evt.level === "error") console.error(line);
    else if (evt.level === "warning") console.warn(line);
    else if (evt.level === "debug") console.debug(line);
    else console.log(line);
  });
}

// The window title is null at detection and arrives on a later event – see
// docs/recall-sdk.md, "Window metadata arrives after detection". The first real
// title wins, since a later one is likelier to be a post-call screen.
function updateRecordingMetadata(window) {
  if (!currentRecording || !window || window.id !== currentRecording.windowId) {
    return;
  }

  if (window.title && currentRecording.meetingTitle === UNTITLED) {
    currentRecording.meetingTitle = window.title;
    console.log("[recall] Meeting title resolved:", window.title);
    trayCallbacks?.("recording", window.title);
  }
  if (window.platform && currentRecording.platform === "unknown") {
    currentRecording.platform = window.platform;
  }
  if (window.url && !currentRecording.url) {
    currentRecording.url = window.url;
  }
}

async function handleMeetingDetected(evt) {
  console.log("[recall] Meeting detected!", JSON.stringify(evt.window));
  const settings = getSettings();

  if (!settings.autoRecord) {
    console.log("[recall] Auto-record disabled, skipping");
    return;
  }

  const meetingTitle = evt.window?.title || UNTITLED;
  console.log("[recall] Starting recording for:", meetingTitle);

  try {
    const res = await fetch(`${API_BASE}/api/v1/sdk_upload/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${getApiKey(getSettings())}`,
      },
      body: JSON.stringify({
        // The title only survives inside metadata – see docs/recall-api.md,
        // "Creating the upload".
        metadata: { meeting_title: meetingTitle },
        recording_config: {
          video_mixed_mp4: null,
          audio_mixed_mp3: {},
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Failed to create SDK upload:", res.status, errorText);
      trayCallbacks?.("error", `Failed to create upload: ${res.status}`);
      return;
    }

    const { id, upload_token } = await res.json();

    await RecallAiSdk.startRecording({
      windowId: evt.window.id,
      uploadToken: upload_token,
    });

    currentRecording = {
      id,
      windowId: evt.window.id,
      startTime: new Date(),
      meetingTitle,
      // detectPlatform only guesses from the title, which is usually null at
      // this point, so it is only a fallback.
      platform: evt.window?.platform || detectPlatform(meetingTitle),
      url: evt.window?.url || null,
    };

    // Apply anything that arrived while the upload was being created.
    if (latestWindow) updateRecordingMetadata(latestWindow);

    trayCallbacks?.("recording", currentRecording.meetingTitle);
  } catch (err) {
    console.error("Error starting recording:", err);
    trayCallbacks?.("error", err.message);
  }
}

async function handleRecordingEnded() {
  console.log("[recall] Recording ended event received");
  if (!currentRecording) {
    console.log("[recall] No current recording tracked, ignoring");
    // Reset the tray anyway – otherwise a stale "Recording" state persists.
    trayCallbacks?.("idle");
    return;
  }

  // Captured here, not at save time – saving happens after transcript polling,
  // which can add tens of minutes to a duration measured against the clock.
  const recording = { ...currentRecording, endTime: new Date() };
  currentRecording = null;

  trayCallbacks?.("processing");

  try {
    const transcriptSegments = await pollForTranscript(recording.id);
    const settings = getSettings();
    const filename = saveTranscript(
      settings.inboxFolder,
      recording,
      transcriptSegments,
    );

    trayCallbacks?.("transcript-ready", filename);
  } catch (err) {
    console.error("Error processing transcript:", err);
    trayCallbacks?.("error", `Transcript processing failed: ${err.message}`);
  }

  trayCallbacks?.("idle");
}

async function pollForTranscript(uploadId) {
  const maxAttempts = 60;
  const intervalMs = 30000;

  let recordingId = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${API_BASE}/api/v1/sdk_upload/${uploadId}/`, {
      headers: { Authorization: `Token ${getApiKey(getSettings())}` },
    });

    if (!res.ok) {
      console.error("Poll request failed:", res.status);
      await delay(intervalMs);
      continue;
    }

    const data = await res.json();
    const statusCode = data.status?.code;
    console.log(`[recall] SDK upload status: ${statusCode}`);

    if (statusCode === "failed") {
      throw new Error(
        `Upload failed: ${data.status?.sub_code || "unknown reason"}`,
      );
    }

    if (statusCode === "complete" && data.recording_id) {
      recordingId = data.recording_id;
      break;
    }

    await delay(intervalMs);
  }

  if (!recordingId) {
    throw new Error("Timed out waiting for upload to complete");
  }

  console.log(
    `Upload complete. Creating transcript for recording ${recordingId}...`,
  );
  await createTranscript(recordingId);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const transcriptData = await fetchTranscript(recordingId);
    if (transcriptData) {
      return transcriptData;
    }
    console.log("[recall] Transcript not ready yet, retrying...");
    await delay(intervalMs);
  }

  throw new Error("Timed out waiting for transcript");
}

async function createTranscript(recordingId) {
  const res = await fetch(
    `${API_BASE}/api/v1/recording/${recordingId}/create_transcript/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${getApiKey(getSettings())}`,
      },
      body: JSON.stringify({
        provider: {
          assembly_ai_async: {
            // Recall doesn't validate these – a wrong string fails the
            // transcript, not the call. See docs/recall-api.md, "Transcript
            // provider options".
            speech_models: ["universal-3-5-pro", "universal-2"],
            language_code: "en_uk",
            keyterms_prompt: buildKeyterms(getSettings()),
          },
        },
        diarization: {
          use_separate_streams_when_available: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create transcript: ${res.status} ${errorText}`);
  }

  console.log("[recall] Transcript creation requested successfully");
}

async function fetchTranscript(recordingId) {
  const res = await fetch(`${API_BASE}/api/v1/recording/${recordingId}/`, {
    headers: { Authorization: `Token ${getApiKey(getSettings())}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch recording: ${res.status}`);
  }

  const data = await res.json();
  const transcriptStatus = data.media_shortcuts?.transcript?.status?.code;
  const transcriptUrl = data.media_shortcuts?.transcript?.data?.download_url;

  if (transcriptStatus === "done" && transcriptUrl) {
    const transcriptRes = await fetch(transcriptUrl);
    if (!transcriptRes.ok) {
      throw new Error(`Failed to download transcript: ${transcriptRes.status}`);
    }
    return await transcriptRes.json();
  }

  return null;
}

async function stopRecording() {
  if (!currentRecording) return;

  const { windowId } = currentRecording;
  try {
    await RecallAiSdk.stopRecording({ windowId });
    console.log("[recall] Recording stopped for window:", windowId);
  } catch (err) {
    console.error("[recall] stopRecording failed:", err.message);
    console.log("[recall] Attempting SDK shutdown as fallback...");
    try {
      await RecallAiSdk.shutdown();
      await RecallAiSdk.init({
        api_url: API_BASE,
        acquirePermissionsOnStartup: [],
      });
      console.log("[recall] SDK restarted after fallback shutdown");
    } catch (shutdownErr) {
      console.error(
        "[recall] SDK shutdown fallback failed:",
        shutdownErr.message,
      );
    }
  }
}

function isRecording() {
  return currentRecording !== null;
}

function getCurrentRecording() {
  return currentRecording;
}

function detectPlatform(title) {
  const lower = (title || "").toLowerCase();
  if (lower.includes("zoom")) return "zoom";
  if (lower.includes("google meet") || lower.includes("meet.google"))
    return "google-meet";
  if (lower.includes("teams")) return "teams";
  if (lower.includes("webex")) return "webex";
  return "unknown";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  init,
  shutdown,
  stopRecording,
  isRecording,
  getCurrentRecording,
};

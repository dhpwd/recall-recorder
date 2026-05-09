const RecallAiSdk = require("@recallai/desktop-sdk").default;
const { saveTranscript } = require("./transcript");
const { getApiKey } = require("./settings");

const API_BASE = "https://eu-central-1.recall.ai";
let currentRecording = null;
let trayCallbacks = null;
let getSettings = null;

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

  RecallAiSdk.addEventListener("sdk-state-change", (evt) => {
    const code = evt.sdk?.state?.code;
    console.log("[recall] SDK state change:", code);
    if (code === "recording") {
      trayCallbacks?.("recording");
    } else if (code === "idle" && !currentRecording) {
      trayCallbacks?.("idle");
    }
  });

  RecallAiSdk.addEventListener("permissions-granted", () => {
    console.log("[recall] All permissions granted");
  });

  try {
    await RecallAiSdk.requestPermission("microphone");
    console.log("[recall] Microphone permission requested");
    await RecallAiSdk.requestPermission("screen-capture");
    console.log("[recall] Screen capture permission requested");
  } catch (err) {
    console.error("[recall] Permission request failed:", err);
  }
}

async function handleMeetingDetected(evt) {
  console.log("[recall] Meeting detected!", JSON.stringify(evt.window));
  const settings = getSettings();

  if (!settings.autoRecord) {
    console.log("[recall] Auto-record disabled, skipping");
    return;
  }

  try {
    if (require("./inperson").isRecording()) {
      console.log("[recall] In-person recording active, skipping auto-record");
      return;
    }
  } catch {}

  const meetingTitle = evt.window?.title || "Untitled Meeting";
  console.log("[recall] Starting recording for:", meetingTitle);

  try {
    const res = await fetch(`${API_BASE}/api/v1/sdk_upload/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${getApiKey(getSettings())}`,
      },
      body: JSON.stringify({ meeting_title: meetingTitle }),
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
      platform: detectPlatform(meetingTitle),
    };

    trayCallbacks?.("recording", meetingTitle);
  } catch (err) {
    console.error("Error starting recording:", err);
    trayCallbacks?.("error", err.message);
  }
}

async function handleRecordingEnded() {
  console.log("[recall] Recording ended event received");
  if (!currentRecording) {
    console.log("[recall] No current recording tracked, ignoring");
    return;
  }

  const recording = { ...currentRecording };
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

  // Phase 1: Wait for the upload to complete and get the recording ID
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

  // Phase 2: Create the async transcript
  console.log(
    `Upload complete. Creating transcript for recording ${recordingId}...`,
  );
  await createTranscript(recordingId);

  // Phase 3: Poll recording until transcript is ready
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
            speech_models: ["universal-3-pro"],
            language_code: "en_uk",
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
      await RecallAiSdk.init({ api_url: API_BASE });
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

module.exports = { init, stopRecording, isRecording, getCurrentRecording };

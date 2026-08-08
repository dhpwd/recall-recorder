#!/usr/bin/env node
/**
 * Recovery script: polls Recall API for a recording, creates transcript, saves to inbox.
 *
 * Usage: node recover-transcript.js <upload-id> ["Meeting title"] [--rerender]
 *
 * --rerender writes the markdown again from the transcript already on the
 * recording. Nothing is created, so it costs nothing and cannot overwrite a
 * recovered transcript with a worse one. Use it after a change to
 * src/transcript.js, or on a call whose transcript was re-created with
 * different diarisation settings – re-running the default path there would
 * request speaker-timeline diarisation again and undo the recovery.
 *
 * The stored title is captured when the meeting is detected, before the
 * platform reports one, so it is almost always "Untitled Meeting" – and
 * sdk_upload is immutable (GET, HEAD, OPTIONS only), so it can't be corrected
 * after the fact. Pass the real title as the second argument to override it.
 *
 * Reads API key from settings.json or RECALL_API_KEY env var.
 * The upload ID can be found via: curl -H "Authorization: Token $KEY" \
 *   "https://eu-central-1.recall.ai/api/v1/sdk_upload/?ordering=-created_at&limit=5"
 */

const fs = require("node:fs");
const path = require("node:path");
const { transformTranscript, buildFilename } = require("./src/transcript");
const { buildKeyterms } = require("./src/keyterms");

const API_BASE = "https://eu-central-1.recall.ai";
const INBOX = path.join(process.env.HOME, "call-transcripts", "inbox");
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 60;

const args = process.argv.slice(2);
const rerender = args.includes("--rerender");
const positional = args.filter((a) => !a.startsWith("--"));
const uploadId = positional[0];
const titleOverride = positional[1];
if (!uploadId) {
  console.error(
    'Usage: node recover-transcript.js <upload-id> ["Meeting title"] [--rerender]',
  );
  console.error(
    "\nFind your upload ID with:\n  curl -s -H 'Authorization: Token $KEY' \\\n    'https://eu-central-1.recall.ai/api/v1/sdk_upload/?ordering=-created_at&limit=5'",
  );
  process.exit(1);
}

// src/settings.js can't be required here – it pulls in electron. The path is
// app.getPath("userData"), which takes its name from productName.
function readSettings() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(
          process.env.HOME,
          "Library/Application Support/Recall Recorder/settings.json",
        ),
        "utf-8",
      ),
    );
  } catch {
    return {};
  }
}

function getApiKey() {
  if (process.env.RECALL_API_KEY) return process.env.RECALL_API_KEY;
  const settings = readSettings();
  if (settings.recallApiKey) return settings.recallApiKey;
  console.error("No API key found. Set RECALL_API_KEY env var.");
  process.exit(1);
}

const API_KEY = getApiKey();
const headers = {
  Authorization: `Token ${API_KEY}`,
  "Content-Type": "application/json",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveRecordingId() {
  console.log(`Fetching upload ${uploadId}...`);
  const res = await fetch(`${API_BASE}/api/v1/sdk_upload/${uploadId}/`, {
    headers,
  });
  if (!res.ok) throw new Error(`Failed to fetch upload: ${res.status}`);
  const data = await res.json();

  if (!data.recording_id) {
    throw new Error(
      `Upload has no recording_id yet (status: ${data.status?.code}). Recording may still be uploading.`,
    );
  }

  console.log(`Recording ID: ${data.recording_id}`);
  console.log(`Upload status: ${data.status?.code}`);
  return {
    recordingId: data.recording_id,
    createdAt: data.created_at,
    meetingTitle: data.metadata?.meeting_title,
  };
}

async function fetchRecording(recordingId) {
  const res = await fetch(`${API_BASE}/api/v1/recording/${recordingId}/`, {
    headers,
  });
  if (!res.ok) throw new Error(`Failed to fetch recording: ${res.status}`);
  return res.json();
}

async function waitForRecordingReady(recordingId) {
  console.log(`Polling recording until processing completes...`);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const data = await fetchRecording(recordingId);
    // The request schema names these audio_mixed_mp3 / video_mixed_mp4, but the
    // recording response drops the format suffix.
    const mediaStatus =
      data.media_shortcuts?.audio_mixed?.status?.code ||
      data.media_shortcuts?.video_mixed?.status?.code;
    const recordingStatus = data.status?.code;
    console.log(
      `  [${i + 1}/${MAX_ATTEMPTS}] recording=${recordingStatus} media=${mediaStatus}`,
    );

    if (recordingStatus === "done" || mediaStatus === "done") {
      console.log("Recording processing complete.");
      return data;
    }
    if (recordingStatus === "failed") {
      throw new Error(`Recording failed: ${data.status?.sub_code}`);
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for recording to finish processing");
}

async function createTranscript(recordingId) {
  console.log("Creating transcript...");
  const res = await fetch(
    `${API_BASE}/api/v1/recording/${recordingId}/create_transcript/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        // Keep in step with createTranscript in src/recall.js.
        provider: {
          assembly_ai_async: {
            speech_models: ["universal-3-5-pro", "universal-2"],
            language_code: "en_uk",
            keyterms_prompt: buildKeyterms(readSettings()),
          },
        },
        diarization: {
          use_separate_streams_when_available: true,
        },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create transcript: ${res.status} ${text}`);
  }
  console.log("Transcript creation requested.");
}

async function waitForTranscript(recordingId) {
  console.log("Polling for transcript...");
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const data = await fetchRecording(recordingId);
    const transcriptStatus = data.media_shortcuts?.transcript?.status?.code;
    const transcriptUrl = data.media_shortcuts?.transcript?.data?.download_url;

    console.log(`  [${i + 1}/${MAX_ATTEMPTS}] transcript=${transcriptStatus}`);

    if (transcriptStatus === "done" && transcriptUrl) {
      console.log("Transcript ready. Downloading...");
      const res = await fetch(transcriptUrl);
      if (!res.ok)
        throw new Error(`Failed to download transcript: ${res.status}`);
      return res.json();
    }
    if (transcriptStatus === "failed") {
      throw new Error("Transcript creation failed");
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for transcript");
}

// Fetches the transcript already attached to the recording. No creation, so
// whatever diarisation settings produced it are preserved.
async function fetchExistingTranscript(recordingId) {
  const data = await fetchRecording(recordingId);
  const t = data.media_shortcuts?.transcript;
  if (t?.status?.code !== "done" || !t?.data?.download_url) {
    throw new Error(
      `No completed transcript to re-render (status: ${t?.status?.code ?? "none"}). Drop --rerender to create one.`,
    );
  }
  console.log("Re-rendering from the existing transcript – creating nothing.");
  const res = await fetch(t.data.download_url);
  if (!res.ok) throw new Error(`Failed to download transcript: ${res.status}`);
  return { segments: await res.json(), recording: data };
}

function saveToInbox(segments, { uploadId, startTime, endTime, meetingTitle }) {
  const content = transformTranscript(segments, {
    startTime,
    endTime,
    meetingTitle,
    uploadId,
    platform: "unknown",
  });

  if (!fs.existsSync(INBOX)) {
    fs.mkdirSync(INBOX, { recursive: true });
  }

  const filename = buildFilename(startTime, meetingTitle);
  const filePath = path.join(INBOX, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`\nTranscript saved: ${filePath}`);
}

async function main() {
  try {
    const { recordingId, createdAt, meetingTitle } = await resolveRecordingId();

    let segments;
    let recording;
    if (rerender) {
      ({ segments, recording } = await fetchExistingTranscript(recordingId));
    } else {
      recording = await waitForRecordingReady(recordingId);
      await createTranscript(recordingId);
      segments = await waitForTranscript(recordingId);
    }

    saveToInbox(segments, {
      uploadId,
      // The recording's own timestamps beat the upload's created_at, and give
      // a real duration rather than one measured to the end of transcription.
      startTime: new Date(recording?.started_at || createdAt),
      endTime: recording?.completed_at
        ? new Date(recording.completed_at)
        : undefined,
      // Recordings made before meeting_title moved into metadata have none.
      meetingTitle: titleOverride || meetingTitle || "Recovered Meeting",
    });
    console.log("Recovery complete!");
  } catch (err) {
    console.error("Recovery failed:", err.message);
    process.exit(1);
  }
}

main();

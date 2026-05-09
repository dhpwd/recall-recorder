#!/usr/bin/env node
/**
 * Recovery script: polls Recall API for a recording, creates transcript, saves to inbox.
 *
 * Usage: node recover-transcript.js <upload-id>
 *
 * Reads API key from settings.json or RECALL_API_KEY env var.
 * The upload ID can be found via: curl -H "Authorization: Token $KEY" \
 *   "https://eu-central-1.recall.ai/api/v1/sdk_upload/?ordering=-created_at&limit=5"
 */

const fs = require("node:fs");
const path = require("node:path");
const { transformTranscript, buildFilename } = require("./src/transcript");
const { LANGUAGE_CODE } = require("./src/constants");

const API_BASE = "https://eu-central-1.recall.ai";
const INBOX = path.join(process.env.HOME, "call-transcripts", "inbox");
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 60;

const uploadId = process.argv[2];
if (!uploadId) {
  console.error("Usage: node recover-transcript.js <upload-id>");
  console.error(
    "\nFind your upload ID with:\n  curl -s -H 'Authorization: Token $KEY' \\\n    'https://eu-central-1.recall.ai/api/v1/sdk_upload/?ordering=-created_at&limit=5'",
  );
  process.exit(1);
}

function getApiKey() {
  if (process.env.RECALL_API_KEY) return process.env.RECALL_API_KEY;
  try {
    const settingsPath = path.join(
      process.env.HOME,
      "Library/Application Support/recall-recorder/settings.json",
    );
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (settings.recallApiKey) return settings.recallApiKey;
  } catch {}
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
  return { recordingId: data.recording_id, createdAt: data.created_at };
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
    const videoStatus = data.media_shortcuts?.video_mixed?.status?.code;
    const recordingStatus = data.status?.code;
    console.log(
      `  [${i + 1}/${MAX_ATTEMPTS}] recording=${recordingStatus} video=${videoStatus}`,
    );

    if (recordingStatus === "done" || videoStatus === "done") {
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
        provider: {
          assembly_ai_async: {
            speech_models: ["universal-3-pro"],
            language_code: LANGUAGE_CODE,
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

function saveToInbox(segments, { uploadId, createdAt }) {
  const startTime = new Date(createdAt);
  const meetingTitle = "Recovered Meeting";

  const content = transformTranscript(segments, {
    startTime,
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
    const { recordingId, createdAt } = await resolveRecordingId();
    await waitForRecordingReady(recordingId);
    await createTranscript(recordingId);
    const segments = await waitForTranscript(recordingId);
    saveToInbox(segments, { uploadId, createdAt });
    console.log("Recovery complete!");
  } catch (err) {
    console.error("Recovery failed:", err.message);
    process.exit(1);
  }
}

main();

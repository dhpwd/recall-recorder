const fs = require("node:fs");

const BASE = "https://api.assemblyai.com/v2";
const LANGUAGE_CODE = "en_uk";

async function uploadAudio(filePath, apiKey) {
  const data = fs.readFileSync(filePath);
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/octet-stream",
    },
    body: data,
  });
  if (!res.ok) {
    throw new Error(
      `AssemblyAI upload failed: ${res.status} ${await res.text()}`,
    );
  }
  const { upload_url } = await res.json();
  return upload_url;
}

async function createTranscript(audioUrl, apiKey) {
  const res = await fetch(`${BASE}/transcript`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      language_code: LANGUAGE_CODE,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `AssemblyAI transcript create failed: ${res.status} ${await res.text()}`,
    );
  }
  const { id } = await res.json();
  return id;
}

async function pollTranscript(
  id,
  apiKey,
  { maxAttempts = 90, intervalMs = 10_000 } = {},
) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${BASE}/transcript/${id}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      throw new Error(`AssemblyAI poll failed: ${res.status}`);
    }
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "error") {
      throw new Error(`AssemblyAI transcription error: ${data.error}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for AssemblyAI transcript");
}

function utterancesToSegments(transcript) {
  const utterances = transcript.utterances || [];
  if (utterances.length === 0) {
    if (!transcript.text) return [];
    return [
      {
        participant: { name: "Speaker", id: "0" },
        words: [
          { text: transcript.text, start_timestamp: { relative: 0 } },
        ],
      },
    ];
  }
  return utterances.map((u) => ({
    participant: { name: `Speaker ${u.speaker}`, id: u.speaker },
    words: (u.words || []).map((w) => ({
      text: w.text,
      start_timestamp: { relative: (w.start || 0) / 1000 },
    })),
  }));
}

async function transcribeFile(filePath, apiKey) {
  const audioUrl = await uploadAudio(filePath, apiKey);
  const id = await createTranscript(audioUrl, apiKey);
  const transcript = await pollTranscript(id, apiKey);
  return utterancesToSegments(transcript);
}

module.exports = { transcribeFile };

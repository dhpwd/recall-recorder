const fs = require("node:fs");
const path = require("node:path");

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Real meeting titles and participant names reach the frontmatter, and a title
// containing a double quote would otherwise produce invalid YAML.
function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// The clock at save time is not the end of the call – saving happens after
// transcript polling. endTime is recorded when recording-ended fires; recovery
// runs have none, so fall back to the last word's offset into the recording.
function durationSeconds(metadata, segments) {
  if (metadata.endTime && metadata.startTime) {
    return (metadata.endTime - metadata.startTime) / 1000;
  }

  let last = 0;
  for (const segment of segments) {
    for (const word of segment.words || []) {
      const offset =
        word.end_timestamp?.relative ?? word.start_timestamp?.relative;
      if (typeof offset === "number" && offset > last) last = offset;
    }
  }
  return last;
}

// What identifies one speaker from another, which differs by diarisation mode.
// Speaker-timeline gives platform participant IDs and can repeat a display
// name across two of them. Machine diarisation gives id: null with a generated
// name (A, B, C), so there the name is the only discriminator – keying on ID
// alone would merge every speaker into one.
function participantKey(segment) {
  const id = segment.participant?.id;
  // Not `id || ...` – participant id 0 is a real ID and falsy.
  if (id !== undefined && id !== null) return `id:${id}`;
  const name = segment.participant?.name;
  return name ? `name:${name}` : "unknown";
}

function displayName(segment) {
  const name = segment.participant?.name;
  if (name) return name;
  const id = segment.participant?.id;
  return id === undefined || id === null ? "Speaker ?" : `Speaker ${id}`;
}

// Two speakers sharing a display name are still two speakers. Merging them
// hides the speaker-timeline collapse documented in system-patterns.md – a
// collapsed transcript would otherwise look exactly like a normal one.
function buildSpeakerLabels(segments) {
  const nameByKey = new Map();
  for (const segment of segments) {
    const key = participantKey(segment);
    if (!nameByKey.has(key)) nameByKey.set(key, displayName(segment));
  }

  const idsPerName = new Map();
  for (const name of nameByKey.values()) {
    idsPerName.set(name, (idsPerName.get(name) ?? 0) + 1);
  }

  const labels = new Map();
  const used = new Map();
  for (const [key, name] of nameByKey) {
    if (idsPerName.get(name) > 1) {
      const n = (used.get(name) ?? 0) + 1;
      used.set(name, n);
      // Both get a number – one plain and one suffixed reads as though the
      // plain one is the real participant.
      labels.set(key, `${name} (${n})`);
    } else {
      labels.set(key, name);
    }
  }

  for (const [name, count] of idsPerName) {
    if (count > 1) {
      console.warn(
        `[transcript] "${name}" covers ${count} participant IDs – check for a speaker-timeline collapse`,
      );
    }
  }

  return labels;
}

function transformTranscript(segments, metadata) {
  const labels = buildSpeakerLabels(segments);
  const participants = [];
  const seen = new Set();
  const lines = [];

  for (const segment of segments) {
    const key = participantKey(segment);
    const speaker = labels.get(key);

    if (!seen.has(key)) {
      seen.add(key);
      participants.push(speaker);
    }

    const words = segment.words || [];
    if (words.length === 0) continue;

    const startSec = words[0]?.start_timestamp?.relative ?? 0;
    const timestamp = formatTimestamp(startSec);
    const text = words.map((w) => w.text).join(" ");

    lines.push(`[${timestamp}] ${speaker}: ${text}`);
  }

  const startTime = metadata.startTime || new Date();
  const durationMinutes = Math.round(durationSeconds(metadata, segments) / 60);

  const frontmatter = [
    "---",
    `date: ${yamlString(startTime.toISOString())}`,
    `platform: ${yamlString(metadata.platform || "unknown")}`,
    `meeting_title: ${yamlString(metadata.meetingTitle || "Untitled Meeting")}`,
    ...(metadata.url ? [`meeting_url: ${yamlString(metadata.url)}`] : []),
    "participants:",
    ...participants.map((p) => `  - ${yamlString(p)}`),
    `duration_minutes: ${durationMinutes}`,
    `recall_upload_id: ${yamlString(metadata.uploadId || "")}`,
    "---",
    "",
  ];

  return frontmatter.join("\n") + lines.join("\n\n") + "\n";
}

function buildFilename(startTime, meetingTitle) {
  const d = startTime || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const timeStr = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  const slug = slugify(meetingTitle || "untitled");
  return `${dateStr}_${timeStr}_${slug}.md`;
}

function saveTranscript(inboxFolder, recording, transcriptSegments) {
  const filename = buildFilename(recording.startTime, recording.meetingTitle);
  const content = transformTranscript(transcriptSegments, {
    startTime: recording.startTime,
    meetingTitle: recording.meetingTitle,
    uploadId: recording.id,
    platform: recording.platform,
    url: recording.url,
    endTime: recording.endTime,
  });

  if (!fs.existsSync(inboxFolder)) {
    fs.mkdirSync(inboxFolder, { recursive: true });
  }

  const filePath = path.join(inboxFolder, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filename;
}

module.exports = {
  saveTranscript,
  transformTranscript,
  buildFilename,
  formatTimestamp,
};

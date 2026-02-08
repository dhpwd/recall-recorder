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

function transformTranscript(segments, metadata) {
  const participants = new Set();
  const lines = [];

  for (const segment of segments) {
    const speaker =
      segment.participant?.name || `Speaker ${segment.participant?.id || "?"}`;
    participants.add(speaker);

    const words = segment.words || [];
    if (words.length === 0) continue;

    const startSec = words[0]?.start_timestamp?.relative ?? 0;
    const timestamp = formatTimestamp(startSec);
    const text = words.map((w) => w.text).join(" ");

    lines.push(`[${timestamp}] ${speaker}: ${text}`);
  }

  const startTime = metadata.startTime || new Date();
  const endTime = new Date();
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  const frontmatter = [
    "---",
    `date: "${startTime.toISOString()}"`,
    `platform: "${metadata.platform || "unknown"}"`,
    `meeting_title: "${metadata.meetingTitle || "Untitled Meeting"}"`,
    "participants:",
    ...Array.from(participants).map((p) => `  - ${p}`),
    `duration_minutes: ${durationMinutes}`,
    `recall_upload_id: "${metadata.uploadId || ""}"`,
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

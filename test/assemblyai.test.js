const { test } = require("node:test");
const assert = require("node:assert/strict");
const { utterancesToSegments } = require("../src/assemblyai");

test("converts AssemblyAI utterances to segment shape", () => {
  const transcript = {
    utterances: [
      {
        speaker: "A",
        start: 1500,
        end: 3500,
        text: "Hello world",
        words: [
          { speaker: "A", text: "Hello", start: 1500, end: 2000 },
          { speaker: "A", text: "world", start: 2100, end: 3500 },
        ],
      },
      {
        speaker: "B",
        start: 4000,
        end: 5000,
        text: "Hi",
        words: [{ speaker: "B", text: "Hi", start: 4000, end: 5000 }],
      },
    ],
  };

  const segments = utterancesToSegments(transcript);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].participant.name, "Speaker A");
  assert.equal(segments[0].participant.id, "A");
  assert.equal(segments[0].words.length, 2);
  assert.equal(segments[0].words[0].text, "Hello");
  assert.equal(segments[0].words[0].start_timestamp.relative, 1.5);
  assert.equal(segments[1].participant.name, "Speaker B");
});

test("falls back to a single Speaker block when no utterances", () => {
  const segments = utterancesToSegments({ utterances: [], text: "Just text" });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].participant.name, "Speaker");
  assert.equal(segments[0].words[0].text, "Just text");
  assert.equal(segments[0].words[0].start_timestamp.relative, 0);
});

test("returns empty array when transcript has neither utterances nor text", () => {
  assert.deepEqual(utterancesToSegments({}), []);
});

test("tolerates utterance with missing words array", () => {
  const transcript = {
    utterances: [{ speaker: "A", start: 0, text: "x" }],
  };
  const segments = utterancesToSegments(transcript);
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0].words, []);
});

test("treats missing word.start as zero", () => {
  const transcript = {
    utterances: [
      {
        speaker: "A",
        text: "x",
        words: [{ text: "x" }],
      },
    ],
  };
  const segments = utterancesToSegments(transcript);
  assert.equal(segments[0].words[0].start_timestamp.relative, 0);
});

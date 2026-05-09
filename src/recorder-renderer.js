let recorder = null;
let stream = null;

window.recorder.onStart(async () => {
  if (recorder) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const buf = await e.data.arrayBuffer();
        window.recorder.chunk(buf);
      }
    };
    recorder.onstop = () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      recorder = null;
      window.recorder.stopped();
    };
    recorder.onerror = (e) => {
      window.recorder.error(String(e?.error || e));
    };
    recorder.start(1000);
    console.log("[recorder] started");
  } catch (err) {
    console.error("[recorder] failed to start:", err);
    window.recorder.error(err?.message || String(err));
  }
});

window.recorder.onStop(() => {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  } else {
    window.recorder.stopped();
  }
});

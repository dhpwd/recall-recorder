# Active Context

## Open investigation: Teams auto-stop failure

The SDK failed to auto-stop recording after a Teams call on 09/03/2026. The `recording-ended` event never fired despite the call ending. Auto-stop has worked reliably on previous calls (including Teams).

Possible causes:

- Teams keeping the window open with a post-call screen, preventing the SDK from detecting the meeting ended
- A Teams-specific edge case in the SDK's meeting detection

**Blocked by:** No persistent logging in the packaged app – `console.log` output is lost. Need to add file-based or macOS unified logging before this can be properly diagnosed.

**Next steps:**

- Add persistent logging to the app
- Monitor for recurrence – if it happens again, the `stopRecording({ windowId })` fix and `shutdown()` fallback should handle it gracefully

## To test: was the accessibility permission change actually needed?

The original code called `requestPermission("accessibility")` on every startup and worked fine. After a rebuild, the accessibility toggle stopped persisting. We removed the programmatic request AND cleaned up the stale System Settings entry – both at roughly the same time, so we don't know which fix actually mattered.

Recall's docs say `requestPermission` should be safe (no-ops if already granted). The real fix may have just been removing the stale accessibility entry after the rebuild.

**To test on next rebuild:** restore `requestPermission("accessibility")`, do a clean build, remove stale accessibility entries, add fresh via '+' button, and see if the toggle persists across restarts. If it does, the code change was unnecessary and we can revert it.

# KontentOS Video Editor — Step-by-Step Fix & Build Blueprint

This guide provides simple, step-by-step procedures to resolve all critical bugs, workflow issues, and missing NLE features identified in KontentOS.

---

## Part 1: Critical Bug Fixes

### 🐛 Fix 1: Audio Drift & Dual-Video Sync Race Conditions
**Goal**: Eliminate audio desync and black flash frames when jumping across video clips.
* **Target File**: `KontentOS-App/src/components/ReelPreview.tsx`

#### Implementation Steps:
1. **Add `isSeeking` Gate**:
   * Open [`ReelPreview.tsx`](file:///d:/Abu%20Horairah%20Ansari/Internship_Projects/KontentOS%20v3/KontentOS-App/src/components/ReelPreview.tsx).
   * Inside the frame render loop (`rAF`), skip updating `currentTime` on active `<video>` if `video.seeking` is `true`.
2. **Preload Upcoming Clips**:
   * Inspect active track clips for the clip immediately following `t`.
   * Set inactive player's (`videoRefB` if `videoRefA` is active) `src` to next clip's source URL and call `preload="auto"` when playhead is within 1.5s of transition.
3. **Synchronize Audio Clock to Primary Video**:
   * Clamp `tRef.current` strictly to `activeVideoElement.currentTime + clip.startOnTimeline - clip.trimStart` during playback.

---

### 🐛 Fix 2: Ripple Sync Disruption on Clip Deletion & Trim
**Goal**: Keep B-Roll overlays, text captions, and sound effects strictly aligned when video clips are cut or trimmed.
* **Target File**: `KontentOS-App/src/lib/timeline.ts`

#### Implementation Steps:
1. **Extend Timeline Models with Parent Locking**:
   * In [`timeline.ts`](file:///d:/Abu%20Horairah%20Ansari/Internship_Projects/KontentOS%20v3/KontentOS-App/src/lib/timeline.ts), update `TimelineClip` interface to support an optional `parentClipId?: string` property.
2. **Update `deleteClip` and `tightenGaps` Helpers**:
   * Calculate offset delta $\Delta t$ whenever a video clip is shortened or removed.
   * Shift all clips across text, b-roll, and SFX tracks whose `startOnTimeline` is greater than deleted clip's start time by $-\Delta t$.
3. **Auto-Clean Orphaned Captions**:
   * If a video section is deleted, truncate or split text clips overlapping the deleted duration.

---

### 🐛 Fix 3: SFX Triggering Engine Optimization
**Goal**: Prevent duplicate sound effect triggers and audio clipping during frame stutters.
* **Target File**: `KontentOS-App/src/components/ReelPreview.tsx` & `KontentOS-App/src/utils/sfxEngine.ts`

#### Implementation Steps:
1. **Add Triggered Clips Map**:
   * Maintain a `Set<string>` of `triggeredSfxIds` in `ReelPreview.tsx`.
2. **Check-and-Set Execution Gate**:
   * When `t` passes `sfx.startOnTimeline`:
     * Execute `sfxEngine.play(sfx.type)` only if `!triggeredSfxIds.has(sfx.id)`.
     * Add `sfx.id` to `triggeredSfxIds`.
3. **Reset Triggers on Manual Seek**:
   * When user drags playhead or calls `seek()`, clear `triggeredSfxIds.current.clear()`.

---

### 🐛 Fix 4: WebAssembly FFmpeg Filter Graph Memory Fix
**Goal**: Prevent WASM out-of-memory crashes and stream index mismatches during multi-layer project exports.
* **Target File**: `KontentOS-App/src/utils/ffmpegFilterCompiler.ts`

#### Implementation Steps:
1. **Normalize Filter Stream Names**:
   * In [`ffmpegFilterCompiler.ts`](file:///d:/Abu%20Horairah%20Ansari/Internship_Projects/KontentOS%20v3/KontentOS-App/src/utils/ffmpegFilterCompiler.ts), generate strictly sequential labels (`[v_in0]`, `[v_in1]`, `[v_out]`) for each pass.
2. **Optimize Image/Video Scaling Parameters**:
   * Add scale constraints `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` to ensure even dimension alignment for H.264 encoder.
3. **Chunked Processing**:
   * For projects longer than 60 seconds, compile filter graph into intermediate segments before final concat pass to conserve WebAssembly RAM.

---

## Part 2: High-Priority Feature Implementations

### ✨ Feature 1: Real-Time Audio Waveforms on Timeline Tracks
**Goal**: Draw audio amplitude peaks inside video/audio clips for precision beat and pause cutting.

#### Implementation Steps:
1. **Create Web Audio Peak Extractor Utility**:
   * Add `src/utils/audioWaveform.ts` that fetches clip audio, decodes via `AudioContext.decodeAudioData()`, and downsamples buffer to 100 peak points per second.
2. **Render Canvas Waveform in Timeline**:
   * In clip track component (`src/screens/SmartEditor.tsx`), embed a `<canvas>` element under clip text.
   * Draw vertical amplitude lines using primary accent color (`#285C4D`).

---

### ✨ Feature 2: Frame-Accurate Stepping & Standard NLE Shortcuts
**Goal**: Enable frame-by-frame navigation using arrow keys and J-K-L speed playback controls.

#### Implementation Steps:
1. **Add Frame Jump Helper**:
   * In `SmartEditor.tsx`, compute `frameDuration = 1 / (project.projectMetadata.frameRate || 30)`.
2. **Bind Keyboard Listeners**:
   * `ArrowLeft`: `setTime(Math.max(0, time - frameDuration))`
   * `ArrowRight`: `setTime(Math.min(duration, time + frameDuration))`
   * `J`: Reverse / speed up backward playback (`-1x`, `-2x`, `-4x`).
   * `K`: Pause playback.
   * `L`: Forward / speed up forward playback (`1x`, `2x`, `4x`).
   * `S` or `B`: Split active clips at playhead time `t`.

---

### ✨ Feature 3: Multi-Clip Selection & Marquee Grouping
**Goal**: Allow editors to select multiple clips with Shift+Click or Marquee Box drag to batch move or delete.

#### Implementation Steps:
1. **Add `selectedIds` Array to State**:
   * Change single `selectedId: string | null` state to `selectedIds: string[]`.
2. **Handle Shift-Selection**:
   * When clicking a clip: if `event.shiftKey` or `event.metaKey` is pressed, append `clip.id` to `selectedIds`.
3. **Batch Move Handler**:
   * When dragging one selected clip, apply offset $\Delta t$ to all items in `selectedIds`.

---

### ✨ Feature 4: Direct Canvas Subtitle Editor
**Goal**: Double-click subtitle text on canvas to modify wording or timing live.

#### Implementation Steps:
1. **Enable Editable Overlay**:
   * In `ReelPreview.tsx`, attach `onDoubleClick` handler to text caption container.
2. **Switch to ContentEditable Input**:
   * Replace static text div with an inline `<input>` or `contentEditable` element on double-click.
3. **Sync Back to Store**:
   * On `blur` or `Enter` key, call `applyEdit()` updating target caption clip text in timeline state.

---

### ✨ Feature 5: Punch Zoom & Keyframing Curve Engine
**Goal**: Smooth scale and position animation curves for dynamic emphasis zoom-ins.

#### Implementation Steps:
1. **Add Scale Keyframes to `VideoClip`**:
   * Extend clip schema with `keyframes?: Array<{ time: number; scale: number; x: number; y: number }>` in `timeline.ts`.
2. **Interpolate in Canvas Render**:
   * Compute smooth cubic-bezier easing between keyframe points at time `t`.
3. **Apply Transform**:
   * Apply `transform: scale(...) translate(...)` in `ReelPreview.tsx` video container.

---

## 🎯 Implementation Checklist Summary

- [ ] **Fix 1**: Implement `isSeeking` guard & dual-player preloading in `ReelPreview.tsx`.
- [ ] **Fix 2**: Add parent-clip locking & ripple offset in `timeline.ts`.
- [ ] **Fix 3**: Implement `triggeredSfxIds` set in `ReelPreview.tsx`.
- [ ] **Fix 4**: Enforce even dimension scaling & stream label indexing in `ffmpegFilterCompiler.ts`.
- [ ] **Feature 1**: Add canvas audio waveform renderer in timeline clips.
- [ ] **Feature 2**: Bind `J-K-L` and `ArrowLeft/Right` frame stepping shortcuts in `SmartEditor.tsx`.
- [ ] **Feature 3**: Enable `Shift+Click` multi-select and batch move.
- [ ] **Feature 4**: Enable double-click inline canvas text editor.
- [ ] **Feature 5**: Implement scale/position keyframe interpolation.

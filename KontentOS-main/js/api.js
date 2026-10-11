// KontentOS — Centralized Backend API Client

export const api = {
  // Upload a video in chunked 5MB slices with progress callback
  async uploadVideo(file, onProgress = () => {}) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    // If small file (< 10MB), we can use direct base64 upload for instant speed
    if (totalSize < 10 * 1024 * 1024) {
      onProgress(20);
      const base64Data = await fileToBase64(file);
      onProgress(60);
      const res = await fetch('/api/upload/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64Data.split(',')[1] || base64Data,
          mimeType: file.type || 'video/mp4',
          title: file.name.replace(/\.[^/.]+$/, ''),
        }),
      });
      const data = await res.json();
      onProgress(100);
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.video;
    }

    // Chunked upload session initialization
    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        totalChunks,
        totalSize,
        mimeType: file.type || 'video/mp4',
      }),
    });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error || 'Failed to initialize upload');
    const { uploadId } = initData;

    // Send chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkBlob = file.slice(start, end);
      const chunkBase64 = await blobToBase64(chunkBlob);

      const chunkRes = await fetch('/api/upload/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          chunkIndex: i,
          chunkData: chunkBase64.split(',')[1] || chunkBase64,
        }),
      });
      if (!chunkRes.ok) {
        const err = await chunkRes.json();
        throw new Error(err.error || `Chunk ${i} failed`);
      }

      const progress = Math.round(((i + 1) / totalChunks) * 100);
      onProgress(progress);
    }

    // Complete upload
    const compRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        title: file.name.replace(/\.[^/.]+$/, ''),
      }),
    });
    const compData = await compRes.json();
    if (!compRes.ok) throw new Error(compData.error || 'Failed to finalize upload');
    return compData.video;
  },

  // List all uploaded videos
  async listVideos() {
    const res = await fetch('/api/videos');
    const data = await res.json();
    return data.data || [];
  },

  // Inspect video
  async inspectVideo(videoId) {
    const res = await fetch(`/api/videos/${videoId}/inspect`, { method: 'POST' });
    const data = await res.json();
    return data.data;
  },

  // Delete a video
  async deleteVideo(videoId) {
    const res = await fetch(`/api/videos/${videoId}`, { method: 'DELETE' });
    return res.json();
  },

  // Transcribe video (Gemini 3.6 Flash STT)
  async transcribe(videoId, options = {}) {
    const { forceRefresh = false, targetLanguage = 'English' } = typeof options === 'boolean' ? { forceRefresh: options } : options;
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, forceRefresh, targetLanguage }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transcription failed');
    return data.data;
  },

  // STT Subtitle Translation (Gemini 3.6 Flash)
  async translateSubtitles(videoId, targetLanguage = 'Spanish', srt = '', transcript = '') {
    const res = await fetch('/api/transcribe/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, targetLanguage, srt, transcript }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Translation failed');
    return data.data;
  },

  // Save live microphone STT dictation
  async saveLiveTranscription(videoId, transcriptText, language = 'English') {
    const res = await fetch('/api/transcribe/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcriptText, language }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save live transcription');
    return data.data;
  },

  // Generate Platform Copy and Hashtags (Instagram, YouTube Shorts, TikTok, LinkedIn, X, Threads, Facebook)
  async generateCaption(videoId, transcriptText = '', tone = 'Viral & Punchy', platform = 'instagram', forceRefresh = false, videoTitle = '') {
    const res = await fetch('/api/caption/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcriptText, tone, platform, forceRefresh, videoTitle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Caption generation failed');
    return data.data;
  },

  // Generate AI copy, hooks, and hashtags directly from a video/reel title
  async generateCaptionFromTitle({ title, videoTitle, platform = 'instagram', tone = 'Viral & Punchy', mode = 'all', context = '' }) {
    const res = await fetch('/api/caption/generate-from-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || videoTitle,
        platform,
        tone,
        mode,
        context,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI title-copy generation failed');
    return data.data;
  },

  // Generate copy for all channels in one shot grounded in reel context
  async generateAllCaptions(videoId, transcriptText = '', tone = 'Viral & Punchy', forceRefresh = false, videoTitle = '') {
    const res = await fetch('/api/caption/generate-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcriptText, tone, forceRefresh, videoTitle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Multi-platform caption generation failed');
    return data.data;
  },

  // Update caption or approval flag
  async updateCaption(captionId, updates) {
    const res = await fetch(`/api/caption/${captionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Caption update failed');
    return data.data;
  },

  // Standalone mode status
  async getPlatformStatus() {
    const res = await fetch('/api/publish/status');
    return res.json();
  },

  // Save Reel & Copy to Library / History
  async saveReelRecord(videoId, captionText, hashtags) {
    const res = await fetch('/api/publish/reels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, captionText, hashtags }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Saving failed');
    return data;
  },

  // Alias for backward compatibility
  async publishReel(videoId, captionText, hashtags) {
    return this.saveReelRecord(videoId, captionText, hashtags);
  },

  // Publishing History
  async getPublishingHistory() {
    const res = await fetch('/api/publish/history');
    const data = await res.json();
    return data.data || [];
  },

  async deletePublishingRecord(id) {
    const res = await fetch(`/api/publish/history/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Scheduled Posts API
  async getScheduledPosts() {
    const res = await fetch('/api/publish/schedule');
    const data = await res.json();
    return data.data || [];
  },

  async schedulePost(payload) {
    const res = await fetch('/api/publish/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to schedule post');
    return data;
  },

  async updateScheduledPost(id, updates) {
    const res = await fetch(`/api/publish/schedule/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update scheduled post');
    return data;
  },

  async reschedulePost(id, scheduledAt) {
    return this.updateScheduledPost(id, { scheduledAt });
  },

  async deleteScheduledPost(id) {
    const res = await fetch(`/api/publish/schedule/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete scheduled post');
    return data;
  },

  async crossPostScheduledPost(id, payload) {
    const res = await fetch(`/api/publish/schedule/${id}/crosspost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cross-post to other platforms');
    return data;
  },

  async publishScheduledPostNow(id) {
    const res = await fetch(`/api/publish/schedule/${id}/publish-now`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to publish post immediately');
    return data;
  },

  // User profile
  async getUserProfile() {
    const res = await fetch('/api/user');
    const data = await res.json();
    return data.data;
  },

  async updateUserProfile(profile) {
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return res.json();
  },

  // General Gemini text generation
  async generateGeminiText(prompt) {
    const res = await fetch('/api/caption/text-gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Text generation failed');
    return data;
  },

  // Generate headline & supporting text for visual graphics & carousels
  async generateGraphicCopy(prompt, template = 'instagram') {
    const res = await fetch('/api/script/graphic-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, template }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate headline and supporting text');
    return data.data;
  },
};

// Helper conversion functions
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

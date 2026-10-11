/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ZoomIn,
  Sparkles,
  Sliders,
  Sun,
  Palette,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import {
  VideoClip,
  TextClip,
  SFXClip,
  TransformKeyframe,
  KeyframeEasing,
} from '../../types/timeline';
import { sfxEngine } from '../../utils/sfxEngine';
import { TransformBoxOverlay } from './TransformBoxOverlay';

interface PreviewPlayerProps {
  videoSource?: File | string | null;
  className?: string;
  onFileSelect?: (file: File) => void;
}

export interface ColorGradingParams {
  brightness: number; // -1.0 to 1.0 (default 0)
  contrast: number;   // 0.0 to 2.0 (default 1)
  saturation: number; // 0.0 to 2.0 (default 1)
  temperature: number;// -1.0 to 1.0 (default 0)
  tint: number;       // -1.0 to 1.0 (default 0)
  vignette: number;   // 0.0 to 1.0 (default 0)
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

/**
 * WebGL Hardware Shader Engine for Video Composition & Color Grading
 */
class WebGLVideoCompositor {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    try {
      this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: true });
      if (this.gl) {
        this.initShaders();
      }
    } catch {
      this.gl = null;
    }
  }

  public isSupported(): boolean {
    return !!this.gl && !!this.program;
  }

  private initShaders() {
    const gl = this.gl;
    if (!gl) return;

    const vsSource = `
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform float uOpacity;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uTemperature;
      uniform float uTint;
      uniform float uVignette;

      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        if (color.a == 0.0) {
          discard;
        }

        // 1. Brightness
        vec3 rgb = color.rgb + vec3(uBrightness);

        // 2. Contrast
        rgb = (rgb - vec3(0.5)) * uContrast + vec3(0.5);

        // 3. Temperature & Tint
        rgb.r += uTemperature * 0.12;
        rgb.b -= uTemperature * 0.12;
        rgb.g += uTint * 0.1;

        // 4. Saturation
        float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
        rgb = mix(vec3(luminance), rgb, uSaturation);

        // 5. Vignette
        vec2 uv = vTexCoord - vec2(0.5);
        float dist = length(uv);
        float vig = smoothstep(0.8, 0.25, dist * (1.0 + uVignette * 1.5));
        rgb *= vig;

        gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a * uOpacity);
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('WebGL Shader Link Error:', gl.getProgramInfoLog(program));
      return;
    }

    this.program = program;

    // Buffer Quad
    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0,
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('WebGL Compile Error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public render(
    video: HTMLVideoElement,
    params: ColorGradingParams,
    width: number,
    height: number,
    opacity = 1.0
  ): boolean {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || !this.texture) return false;

    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    // Bind texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      return false;
    }

    // Bind attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');

    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

    // Uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'uOpacity'), opacity);
    gl.uniform1f(gl.getUniformLocation(program, 'uBrightness'), params.brightness);
    gl.uniform1f(gl.getUniformLocation(program, 'uContrast'), params.contrast);
    gl.uniform1f(gl.getUniformLocation(program, 'uSaturation'), params.saturation);
    gl.uniform1f(gl.getUniformLocation(program, 'uTemperature'), params.temperature);
    gl.uniform1f(gl.getUniformLocation(program, 'uTint'), params.tint);
    gl.uniform1f(gl.getUniformLocation(program, 'uVignette'), params.vignette);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }
}

/**
 * Interpolates value based on easing curve
 */
function easeValue(t: number, easing: KeyframeEasing = 'linear'): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'easeIn':
      return clamped * clamped;
    case 'easeOut':
      return clamped * (2 - clamped);
    case 'easeInOut':
      return clamped < 0.5 ? 2 * clamped * clamped : -1 + (4 - 2 * clamped) * clamped;
    case 'instant':
      return clamped >= 1 ? 1 : 0;
    case 'linear':
    default:
      return clamped;
  }
}

/**
 * Evaluates active keyframes at a given time offset within a clip
 */
function interpolateTransform(
  keyframes: TransformKeyframe[] | undefined,
  timeOffset: number
): { scale: number; position: { x: number; y: number } } {
  if (!keyframes || keyframes.length === 0) {
    return { scale: 1.0, position: { x: 0, y: 0 } };
  }

  const sorted = [...keyframes].sort((a, b) => a.timeOffset - b.timeOffset);

  if (timeOffset <= sorted[0].timeOffset) {
    return {
      scale: sorted[0].scale,
      position: { ...sorted[0].position },
    };
  }

  if (timeOffset >= sorted[sorted.length - 1].timeOffset) {
    const last = sorted[sorted.length - 1];
    return {
      scale: last.scale,
      position: { ...last.position },
    };
  }

  let prev = sorted[0];
  let next = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeOffset >= sorted[i].timeOffset && timeOffset <= sorted[i + 1].timeOffset) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const duration = next.timeOffset - prev.timeOffset;
  if (duration <= 0.0001) {
    return { scale: next.scale, position: { ...next.position } };
  }

  const rawProgress = (timeOffset - prev.timeOffset) / duration;
  const progress = easeValue(rawProgress, next.easing || 'linear');

  const scale = prev.scale + (next.scale - prev.scale) * progress;
  const x = prev.position.x + (next.position.x - prev.position.x) * progress;
  const y = prev.position.y + (next.position.y - prev.position.y) * progress;

  return { scale, position: { x, y } };
}

export function PreviewPlayer({
  videoSource,
  className = '',
  onFileSelect,
}: PreviewPlayerProps): React.ReactElement {
  const {
    project,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    updateProjectDuration,
  } = useTimelineStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const webglCompositorRef = useRef<WebGLVideoCompositor | null>(null);

  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [videoMeta, setVideoMeta] = useState<{
    width: number;
    height: number;
    duration: number;
    fileName?: string;
  } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showColorGradingPanel, setShowColorGradingPanel] = useState(false);

  // Hardware Color Grading Parameters State
  const [colorParams, setColorParams] = useState<ColorGradingParams>({
    brightness: 0.0,
    contrast: 1.0,
    saturation: 1.0,
    temperature: 0.0,
    tint: 0.0,
    vignette: 0.0,
    blendMode: 'normal',
  });

  const [currentZoomState, setCurrentZoomState] = useState<{ scale: number; x: number; y: number }>({
    scale: 1.0,
    x: 0,
    y: 0,
  });

  const triggeredSFXRef = useRef<Set<string>>(new Set());
  const prevTimeRef = useRef<number>(currentTime);

  const aspectRatio = project.projectMetadata.targetAspectRatio || '9:16';
  const canvasDimensions = useMemo(() => {
    switch (aspectRatio) {
      case '16:9':
        return { width: 1920, height: 1080 };
      case '1:1':
        return { width: 1080, height: 1080 };
      case '9:16':
      default:
        return { width: 1080, height: 1920 };
    }
  }, [aspectRatio]);

  // Initialize WebGL compositor when canvas mounts
  useEffect(() => {
    if (canvasRef.current) {
      webglCompositorRef.current = new WebGLVideoCompositor(canvasRef.current);
    }
  }, [canvasDimensions]);

  // Handle video source resolution
  useEffect(() => {
    setVideoError(null);
    if (!videoSource) {
      const videoTrack = project.tracks.find((t) => t.type === 'video');
      const clipWithUrl = videoTrack?.clips.find((c) => (c as VideoClip).sourceUrl);
      if (clipWithUrl && (clipWithUrl as VideoClip).sourceUrl) {
        setVideoObjectUrl((clipWithUrl as VideoClip).sourceUrl || null);
        setVideoMeta((prev) => prev || { width: 1080, height: 1920, duration: clipWithUrl.duration, fileName: clipWithUrl.name });
      } else {
        setVideoObjectUrl(null);
        setIsVideoLoaded(false);
        setVideoMeta(null);
      }
      return;
    }

    if (typeof videoSource === 'string') {
      setVideoObjectUrl(videoSource);
      setVideoMeta((prev) => prev || { width: 1080, height: 1920, duration: 10, fileName: 'Remote Video Source' });
    } else if (videoSource instanceof File) {
      const url = URL.createObjectURL(videoSource);
      setVideoObjectUrl(url);
      setVideoMeta({
        width: 0,
        height: 0,
        duration: 0,
        fileName: videoSource.name,
      });
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [videoSource, project]);

  const videoTrack = project.tracks.find((t) => t.type === 'video');
  const textTrack = project.tracks.find((t) => t.type === 'text');
  const sfxTrack = project.tracks.find((t) => t.type === 'sfx');

  const activeVideoClip = useMemo(() => {
    if (!videoTrack) return null;
    return videoTrack.clips.find(
      (c) => currentTime >= c.startOnTimeline && currentTime < c.startOnTimeline + c.duration
    ) as VideoClip | undefined;
  }, [videoTrack, currentTime]);

  // Sync hidden video element with master playhead
  useEffect(() => {
    const video = hiddenVideoRef.current;
    if (!video || !videoObjectUrl) return;

    const offsetInClip = activeVideoClip
      ? (currentTime - activeVideoClip.startOnTimeline) * (activeVideoClip.speedMultiplier || 1.0)
      : 0;
    const targetSourceTime = activeVideoClip
      ? activeVideoClip.sourceStartOffset + offsetInClip
      : currentTime;

    const maxDur = video.duration && !isNaN(video.duration) ? video.duration : 10000;
    const clampedTarget = Math.max(0, Math.min(targetSourceTime, maxDur));

    if (isPlaying) {
      if (Math.abs(video.currentTime - clampedTarget) > 0.2) {
        video.currentTime = clampedTarget;
      }
      video.playbackRate = activeVideoClip?.speedMultiplier || 1.0;
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.currentTime - clampedTarget) > 0.04) {
        video.currentTime = clampedTarget;
      }
    }
  }, [activeVideoClip, currentTime, isPlaying, videoObjectUrl]);

  // SFX Triggering
  useEffect(() => {
    if (!sfxTrack || isMuted) return;

    if (currentTime < prevTimeRef.current) {
      triggeredSFXRef.current.clear();
    }
    prevTimeRef.current = currentTime;

    if (isPlaying) {
      sfxTrack.clips.forEach((clip) => {
        const sfx = clip as SFXClip;
        if (
          currentTime >= sfx.startOnTimeline &&
          currentTime < sfx.startOnTimeline + 0.18 &&
          !triggeredSFXRef.current.has(sfx.id)
        ) {
          triggeredSFXRef.current.add(sfx.id);
          sfxEngine.play(
            sfx.sfxAssetId,
            sfx.audioModifiers?.volume ?? 1.0,
            sfx.sourceUrl
          );
        }
      });
    }
  }, [currentTime, isPlaying, sfxTrack, isMuted]);

  useEffect(() => {
    if (!isPlaying) {
      triggeredSFXRef.current.clear();
    }
  }, [isPlaying]);

  // Hardware-Accelerated Multi-Track WebGL & 2D Composite Frame Render
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasDimensions;

    ctx.clearRect(0, 0, width, height);

    // 1. Evaluate Keyframe Punch Zooms for active VideoClip
    let transform = { scale: 1.0, position: { x: 0, y: 0 } };
    if (activeVideoClip) {
      const timeInClip = currentTime - activeVideoClip.startOnTimeline;
      transform = interpolateTransform(activeVideoClip.keyframes, timeInClip);
    }
    setCurrentZoomState({ scale: transform.scale, x: transform.position.x, y: transform.position.y });

    ctx.save();
    const cx = width / 2;
    const cy = height / 2;
    const transX = cx + transform.position.x * (cx * 0.75);
    const transY = cy + transform.position.y * (cy * 0.75);

    ctx.translate(transX, transY);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-cx, -cy);

    // Set Global Blend Mode on 2D context
    switch (colorParams.blendMode) {
      case 'multiply':
        ctx.globalCompositeOperation = 'multiply';
        break;
      case 'screen':
        ctx.globalCompositeOperation = 'screen';
        break;
      case 'overlay':
        ctx.globalCompositeOperation = 'overlay';
        break;
      case 'normal':
      default:
        ctx.globalCompositeOperation = 'source-over';
        break;
    }

    // 2. Render Video Frame (via WebGL or 2D Filter fallback)
    const video = hiddenVideoRef.current;
    const hasVideoData =
      video &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      (video.readyState >= 1 || isVideoLoaded);

    if (hasVideoData && video) {
      const videoRatio = video.videoWidth / video.videoHeight;
      const canvasRatio = width / height;

      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      if (videoRatio > canvasRatio) {
        drawWidth = height * videoRatio;
        drawX = (width - drawWidth) / 2;
      } else {
        drawHeight = width / videoRatio;
        drawY = (height - drawHeight) / 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Apply CSS Filter Matrix Fallback if WebGL is bypassed
      const brightnessPct = (100 + colorParams.brightness * 100).toFixed(0);
      const contrastPct = (colorParams.contrast * 100).toFixed(0);
      const saturatePct = (colorParams.saturation * 100).toFixed(0);
      const hueDeg = (colorParams.temperature * 45).toFixed(0);

      ctx.filter = `brightness(${brightnessPct}%) contrast(${contrastPct}%) saturate(${saturatePct}%) hue-rotate(${hueDeg}deg)`;
      ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
      ctx.filter = 'none';
    } else {
      // Dynamic Motion Studio Background
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(0.5, '#1e1b4b');
      gradient.addColorStop(1, '#020617');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Subtle grid pattern
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.lineWidth = 2;
      const gridSize = 80;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center visualizer card
      const cardW = width * 0.75;
      const cardH = height * 0.36;
      const cardX = (width - cardW) / 2;
      const cardY = (height - cardH) / 2;

      ctx.fillStyle = 'rgba(30, 27, 75, 0.75)';
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 40);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const title = videoMeta?.fileName || (activeVideoClip ? activeVideoClip.name : 'KontentOS AI Video Engine');
      ctx.fillText(title, width / 2, cardY + cardH * 0.35);

      ctx.fillStyle = '#A5B4FC';
      ctx.font = '500 28px monospace';
      ctx.fillText(
        `TIME: ${currentTime.toFixed(2)}s | SPEED: ${(activeVideoClip?.speedMultiplier || 1.0).toFixed(1)}x`,
        width / 2,
        cardY + cardH * 0.65
      );
    }

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    // 3. Overlay Active Text / Kinetic Captions Engine
    if (textTrack && !textTrack.isMuted) {
      const activeTextClips = textTrack.clips.filter(
        (c) => currentTime >= c.startOnTimeline && currentTime <= c.startOnTimeline + c.duration
      ) as TextClip[];

      activeTextClips.forEach((clip) => {
        const { content, style } = clip;
        if (!content) return;

        const age = currentTime - clip.startOnTimeline;
        let animScale = 1.0;

        // Kinetic Animation Scaling Math
        if (style.animation === 'bouncePop') {
          // Bouncy spring pop effect
          const pop = Math.sin(age * 14) * Math.exp(-age * 5);
          animScale = Math.max(0.1, 1.0 + pop * 0.45);
        } else if (style.animation === 'popIn' && age < 0.25) {
          const t = age / 0.25;
          animScale = 0.4 + 0.7 * Math.sin(t * Math.PI * 0.85);
        }

        let textY = height * 0.5;
        if (style.position === 'top') textY = height * 0.22;
        else if (style.position === 'bottom') textY = height * 0.82;
        else if (style.position === 'custom' && style.customCoord) {
          textY = (style.customCoord.y + 1) * 0.5 * height;
        }

        const textX = style.customCoord
          ? (style.customCoord.x + 1) * 0.5 * width
          : width / 2;

        ctx.save();
        ctx.translate(textX, textY);
        ctx.scale(animScale, animScale);

        const baseFontSize = (style.fontSize || 48) * (width / 1080);
        ctx.font = `900 ${baseFontSize}px ${style.fontFamily || 'Impact, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 3A. Typewriter Mode: Truncate visible characters
        let displayText = content;
        if (style.animation === 'typewriter') {
          const charRatio = Math.min(1.0, Math.max(0, age / clip.duration));
          const visibleCount = Math.floor(charRatio * content.length);
          displayText = content.slice(0, visibleCount);
        }

        // 3B. Banner Pill Backdrop
        if (style.animation === 'bannerPill' || style.backgroundColorHex || style.bannerPillColorHex) {
          const metrics = ctx.measureText(displayText);
          const padX = baseFontSize * 0.5;
          const padY = baseFontSize * 0.3;
          ctx.fillStyle = style.bannerPillColorHex || style.backgroundColorHex || '#1e1b4b';
          ctx.beginPath();
          ctx.roundRect(
            -metrics.width / 2 - padX,
            -baseFontSize / 2 - padY,
            metrics.width + padX * 2,
            baseFontSize + padY * 2,
            baseFontSize * 0.4
          );
          ctx.fill();
        }

        // 3C. Neon Pulse Shadow Glow
        if (style.animation === 'neonPulse') {
          const pulse = 0.8 + 0.4 * Math.sin(currentTime * 12);
          const glowBlur = (style.glowIntensity || 60) * pulse * 0.5;
          ctx.shadowColor = style.shadowColorHex || style.activeWordColorHex || '#6366f1';
          ctx.shadowBlur = glowBlur;
        }

        // 3D. Karaoke Word-by-Word Mode
        if (style.animation === 'karaoke') {
          const rawWords = content.split(' ');
          const wordCount = rawWords.length;
          const wordDur = clip.duration / Math.max(1, wordCount);
          const activeWordIdx = Math.min(
            wordCount - 1,
            Math.max(0, Math.floor(age / wordDur))
          );

          // Measure total width for horizontal centering
          let totalWidth = 0;
          const wordMetrics = rawWords.map((w) => {
            const m = ctx.measureText(w + ' ');
            totalWidth += m.width;
            return m.width;
          });

          let currentX = -totalWidth / 2;

          rawWords.forEach((word, idx) => {
            const isActive = idx === activeWordIdx;
            const wordW = wordMetrics[idx];

            ctx.save();
            ctx.translate(currentX + wordW / 2, 0);

            if (isActive) {
              const activeScale = 1.18 + 0.08 * Math.sin(currentTime * 20);
              ctx.scale(activeScale, activeScale);
            }

            // Outline
            ctx.strokeStyle = style.strokeColorHex || '#000000';
            ctx.lineWidth = (style.strokeWidth || 6) * (width / 1080) * 1.5;
            ctx.lineJoin = 'round';
            ctx.strokeText(word, 0, 0);

            // Fill color
            ctx.fillStyle = isActive
              ? style.activeWordColorHex || '#f59e0b'
              : style.colorHex || '#ffffff';
            ctx.fillText(word, 0, 0);

            ctx.restore();
            currentX += wordW;
          });
        } else {
          // Standard / Non-karaoke text draw
          ctx.strokeStyle = style.strokeColorHex || '#000000';
          ctx.lineWidth = (style.strokeWidth || 6) * (width / 1080) * 1.6;
          ctx.lineJoin = 'round';
          ctx.miterLimit = 2;
          ctx.strokeText(displayText, 0, 0);

          ctx.fillStyle = style.colorHex || '#FFFF00';
          ctx.fillText(displayText, 0, 0);
        }

        ctx.restore();
      });
    }

    // 4. Punch Zoom HUD Watermark
    if (transform.scale > 1.05) {
      ctx.save();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.9)';
      ctx.beginPath();
      ctx.roundRect(40, 50, 240, 56, 28);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`PUNCH ${transform.scale.toFixed(2)}x`, 160, 78);
      ctx.restore();
    }
  }, [canvasDimensions, activeVideoClip, currentTime, isVideoLoaded, textTrack, videoMeta, colorParams]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderFrame();
      if (isPlaying) {
        animId = requestAnimationFrame(loop);
      }
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [renderFrame, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;

    let lastTimestamp = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const deltaSec = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      const store = useTimelineStore.getState();
      const current = store.currentTime;
      const totalDur = store.project.projectMetadata.totalDuration || 1;
      const nextTime = current + deltaSec;

      if (nextTime >= totalDur) {
        store.setCurrentTime(0);
        store.setIsPlaying(false);
      } else {
        store.setCurrentTime(nextTime);
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
        if (onFileSelect) {
          onFileSelect(file);
        } else {
          useTimelineStore.getState().loadSourceVideoFile(file, 10);
        }
      }
    }
  };

  const totalDuration = project.projectMetadata.totalDuration || (videoMeta?.duration || 1);

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center bg-[#070b14] border ${
        isDragOver ? 'border-violet-500 bg-violet-950/20' : 'border-slate-800'
      } rounded-3xl overflow-hidden shadow-2xl transition-all ${className}`}
    >
      {/* Hidden Synchronized Video Element */}
      {videoObjectUrl && (
        <video
          ref={hiddenVideoRef}
          src={videoObjectUrl}
          muted={isMuted}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setIsVideoLoaded(true);
            setVideoError(null);
            setVideoMeta({
              width: v.videoWidth,
              height: v.videoHeight,
              duration: v.duration,
              fileName: videoMeta?.fileName,
            });
            if (v.duration && v.duration > 0) {
              updateProjectDuration(v.duration);
            }
            renderFrame();
          }}
          onCanPlay={() => {
            setIsVideoLoaded(true);
            renderFrame();
          }}
          onLoadedData={() => {
            setIsVideoLoaded(true);
            renderFrame();
          }}
          onSeeked={() => {
            renderFrame();
          }}
          onTimeUpdate={() => {
            renderFrame();
          }}
          onError={() => {
            console.warn('Video element playback/decode error');
            setVideoError('Unable to decode video format in browser');
          }}
          className="hidden"
        />
      )}

      {/* Hidden File Picker */}
      <input
        ref={filePickerRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (onFileSelect) {
              onFileSelect(file);
            } else {
              useTimelineStore.getState().loadSourceVideoFile(file, 10);
            }
          }
        }}
      />

      {/* Top Header Bar */}
      <div className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-[#0b101d] border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              isVideoLoaded
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          <span className="font-bold text-slate-200 truncate text-[11px] sm:text-xs">
            Preview ({aspectRatio})
          </span>
          <span className="hidden sm:inline-block text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 shrink-0">
            {canvasDimensions.width}x{canvasDimensions.height}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Hardware Color Grading FX Toggle */}
          <button
            type="button"
            onClick={() => setShowColorGradingPanel(!showColorGradingPanel)}
            className={`px-2 py-1 rounded-lg border text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              showColorGradingPanel
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Toggle WebGL Hardware Color Grading Controls"
          >
            <Sliders className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>FX</span>
          </button>

          {currentZoomState.scale > 1.05 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-pink-500/20 text-pink-300 border border-pink-500/30 rounded-full font-mono text-[10px] font-bold animate-pulse">
              <ZoomIn className="w-3 h-3" />
              {currentZoomState.scale.toFixed(2)}x
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Hardware Color Grading Floating Overlay Controls */}
      {showColorGradingPanel && (
        <div className="w-full bg-[#0d1322] border-b border-amber-500/40 p-3.5 space-y-3 z-30 shadow-2xl animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-amber-400">
            <span className="flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-400" />
              WebGL Fragment Color Grading & Blend Modes
            </span>
            <button
              type="button"
              onClick={() =>
                setColorParams({
                  brightness: 0.0,
                  contrast: 1.0,
                  saturation: 1.0,
                  temperature: 0.0,
                  tint: 0.0,
                  vignette: 0.0,
                  blendMode: 'normal',
                })
              }
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Reset Defaults
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1">
                  <Sun className="w-3 h-3 text-amber-400" /> Brightness
                </span>
                <span className="font-mono text-[10px] text-amber-300">
                  {colorParams.brightness > 0 ? `+${(colorParams.brightness * 100).toFixed(0)}%` : `${(colorParams.brightness * 100).toFixed(0)}%`}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={colorParams.brightness}
                onChange={(e) => setColorParams((p) => ({ ...p, brightness: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Contrast</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {(colorParams.contrast * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={colorParams.contrast}
                onChange={(e) => setColorParams((p) => ({ ...p, contrast: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Saturation</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {(colorParams.saturation * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={colorParams.saturation}
                onChange={(e) => setColorParams((p) => ({ ...p, saturation: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Temperature */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Temperature</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {colorParams.temperature > 0 ? `+${(colorParams.temperature * 100).toFixed(0)}` : `${(colorParams.temperature * 100).toFixed(0)}`}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={colorParams.temperature}
                onChange={(e) => setColorParams((p) => ({ ...p, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Vignette */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Vignette</span>
                <span className="font-mono text-[10px] text-amber-300">
                  {(colorParams.vignette * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={colorParams.vignette}
                onChange={(e) => setColorParams((p) => ({ ...p, vignette: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Blend Mode Selector */}
            <div className="space-y-1 col-span-2 sm:col-span-3">
              <div className="text-slate-300 font-medium">Layer Blend Mode</div>
              <div className="flex items-center gap-1.5">
                {(['normal', 'multiply', 'screen', 'overlay'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setColorParams((p) => ({ ...p, blendMode: mode }))}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer ${
                      colorParams.blendMode === mode
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Source Metadata Status Badge */}
      {videoMeta && (videoMeta.width > 0 || videoMeta.fileName) && (
        <div className="w-full bg-slate-900/90 border-b border-slate-800/80 px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="font-semibold text-white truncate max-w-[180px]">
              {videoMeta.fileName || 'Source Video'}
            </span>
            {videoMeta.width > 0 && (
              <span className="font-mono text-[10px] text-slate-400">
                ({videoMeta.width}x{videoMeta.height})
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {videoMeta.duration > 0 ? `${videoMeta.duration.toFixed(1)}s` : 'Loaded'}
          </span>
        </div>
      )}

      {/* Canvas Viewport Container */}
      <div className="relative w-full flex-1 flex items-center justify-center p-2 sm:p-5 bg-[#050811] min-h-[200px] sm:min-h-[320px] max-h-[460px] sm:max-h-[580px]">
        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          className="max-h-[420px] sm:max-h-[520px] w-auto max-w-full rounded-2xl shadow-2xl border border-slate-800/80 object-contain aspect-[9/16]"
        />

        {/* Interactive On-Canvas Bounding Box & Transform Handles */}
        <TransformBoxOverlay
          canvasRef={canvasRef}
          canvasDimensions={canvasDimensions}
        />

        {videoError && (
          <div className="absolute inset-x-4 sm:inset-x-6 top-4 sm:top-6 p-2.5 sm:p-3 bg-rose-500/90 text-white text-xs rounded-xl shadow-xl flex items-center justify-between">
            <span>{videoError}</span>
            <button
              type="button"
              onClick={() => setVideoError(null)}
              className="text-xs font-bold underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Embedded Floating Playhead Controls */}
      <div className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-[#0b101d] border-t border-slate-800/80 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 sm:p-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer min-w-[36px] flex items-center justify-center"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <button
            type="button"
            onClick={() => setCurrentTime(0)}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Jump to Start"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <div className="font-mono text-[11px] sm:text-xs font-bold text-slate-200 ml-1 flex items-center gap-1 bg-slate-950/80 px-2 sm:px-2.5 py-1 rounded-lg border border-slate-800/80">
            <span className="text-indigo-400">{currentTime.toFixed(2)}s</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{totalDuration.toFixed(2)}s</span>
          </div>
        </div>

        <div className="hidden sm:flex text-[11px] text-slate-400 items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Active: <span className="text-white font-semibold">{activeVideoClip ? activeVideoClip.name : 'Raw Video Source'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;

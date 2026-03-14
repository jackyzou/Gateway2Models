import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const GENERATIONS_DIR = join(HOME, ".g2m", "generations");

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// ── Image Generation ─────────────────────────────────────────────────

export const ImageGenRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("auto"),
  n: z.number().int().min(1).max(4).default(1),
  size: z.enum(["256x256", "512x512", "1024x1024"]).default("1024x1024"),
  response_format: z.enum(["url", "b64_json"]).default("b64_json"),
});

export type ImageGenRequest = z.infer<typeof ImageGenRequestSchema>;

export interface ImageGenResponse {
  created: number;
  data: { url?: string; b64_json?: string; revised_prompt?: string }[];
}

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const COMFYUI_BASE = process.env.COMFYUI_BASE_URL ?? "http://localhost:7860";
const STABILITY_KEY = process.env.STABILITY_API_KEY ?? "";
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";

/** Generate images via the best available provider */
export async function generateImages(request: ImageGenRequest): Promise<ImageGenResponse> {
  // Try providers in order of preference: Ollama (free local) → Stability → OpenAI
  const errors: string[] = [];

  // 1. Try Stability AI (free tier available)
  if (STABILITY_KEY) {
    try {
      return await generateViaStability(request);
    } catch (err) {
      errors.push(`Stability: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Try OpenAI DALL-E
  if (OPENAI_KEY) {
    try {
      return await generateViaOpenAI(request);
    } catch (err) {
      errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Try local ComfyUI/Automatic1111
  try {
    return await generateViaLocal(request);
  } catch (err) {
    errors.push(`Local: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error(`No image generation provider available. Tried: ${errors.join("; ")}`);
}

async function generateViaStability(request: ImageGenRequest): Promise<ImageGenResponse> {
  const response = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STABILITY_KEY}`,
    },
    body: JSON.stringify({
      text_prompts: [{ text: request.prompt }],
      cfg_scale: 7,
      height: parseInt(request.size.split("x")[1]),
      width: parseInt(request.size.split("x")[0]),
      samples: request.n,
    }),
  });

  if (!response.ok) throw new Error(`Stability API ${response.status}`);
  const data = await response.json() as { artifacts: { base64: string }[] };

  return {
    created: Math.floor(Date.now() / 1000),
    data: data.artifacts.map((a) => ({ b64_json: a.base64 })),
  };
}

async function generateViaOpenAI(request: ImageGenRequest): Promise<ImageGenResponse> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: request.prompt,
      n: request.n,
      size: request.size,
      response_format: request.response_format,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
  return await response.json() as ImageGenResponse;
}

async function generateViaLocal(request: ImageGenRequest): Promise<ImageGenResponse> {
  // Try Automatic1111/ComfyUI API
  const response = await fetch(`${COMFYUI_BASE}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: request.prompt,
      width: parseInt(request.size.split("x")[0]),
      height: parseInt(request.size.split("x")[1]),
      batch_size: request.n,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error(`Local API ${response.status}`);
  const data = await response.json() as { images: string[] };

  return {
    created: Math.floor(Date.now() / 1000),
    data: data.images.map((img) => ({ b64_json: img })),
  };
}

// ── Audio Transcription ──────────────────────────────────────────────

export const AudioTranscriptionSchema = z.object({
  /** Base64-encoded audio data */
  audio: z.string(),
  model: z.string().default("whisper"),
  language: z.string().optional(),
});

export interface TranscriptionResponse {
  text: string;
}

export async function transcribeAudio(audio: string, model = "whisper"): Promise<TranscriptionResponse> {
  // Use Ollama for local whisper transcription
  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "Transcribe the following audio.",
      images: [audio], // Ollama uses images field for binary data
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`Ollama transcription failed: ${response.status}`);
  const data = await response.json() as { response: string };
  return { text: data.response };
}

// ── Video Generation (Async Job Queue) ───────────────────────────────

export const VideoGenRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("auto"),
  duration: z.number().min(1).max(30).default(5),
  size: z.enum(["512x512", "768x768", "1024x576", "576x1024"]).default("1024x576"),
  /** Webhook URL for completion callback */
  callback_url: z.string().url().optional(),
});

export type VideoGenRequest = z.infer<typeof VideoGenRequestSchema>;

export interface VideoJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  prompt: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  progress: number;
  result?: { url: string; duration: number };
  error?: string;
  callbackUrl?: string;
}

const videoJobs = new Map<string, VideoJob>();

export async function createVideoJob(request: VideoGenRequest): Promise<VideoJob> {
  const id = randomUUID().slice(0, 12);
  const job: VideoJob = {
    id,
    status: "pending",
    prompt: request.prompt,
    model: request.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: 0,
    callbackUrl: request.callback_url,
  };

  videoJobs.set(id, job);

  // Process async
  processVideoJob(job, request).catch((err) => {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    job.updatedAt = Date.now();
  });

  return job;
}

async function processVideoJob(job: VideoJob, request: VideoGenRequest): Promise<void> {
  job.status = "processing";
  job.updatedAt = Date.now();

  try {
    // Try Replicate for free/cheap video generation
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (replicateToken) {
      const result = await generateVideoViaReplicate(request, replicateToken, (progress) => {
        job.progress = progress;
        job.updatedAt = Date.now();
      });
      job.result = result;
    } else {
      // Fallback: use Ollama to generate a description (placeholder)
      job.result = { url: "", duration: request.duration };
      job.error = "No video generation provider configured. Set REPLICATE_API_TOKEN.";
      job.status = "failed";
      job.updatedAt = Date.now();
      return;
    }

    job.status = "completed";
    job.progress = 100;
    job.updatedAt = Date.now();

    // Persist result
    await ensureDir(GENERATIONS_DIR);
    await writeFile(
      join(GENERATIONS_DIR, `${job.id}.json`),
      JSON.stringify(job, null, 2),
      "utf-8",
    );

    // Webhook callback
    if (job.callbackUrl) {
      fetch(job.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      }).catch(() => { /* best-effort callback */ });
    }
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    job.updatedAt = Date.now();
  }
}

async function generateVideoViaReplicate(
  request: VideoGenRequest,
  token: string,
  onProgress: (pct: number) => void,
): Promise<{ url: string; duration: number }> {
  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      version: "luma/ray", // Luma Ray for video generation
      input: {
        prompt: request.prompt,
        num_frames: request.duration * 24,
      },
    }),
  });

  if (!createRes.ok) throw new Error(`Replicate create: ${createRes.status}`);
  const prediction = await createRes.json() as { id: string; urls: { get: string } };

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    onProgress(Math.min(90, (i / 120) * 100));

    const pollRes = await fetch(prediction.urls.get, {
      headers: { Authorization: `Token ${token}` },
    });
    const status = await pollRes.json() as {
      status: string;
      output?: string;
      error?: string;
    };

    if (status.status === "succeeded" && status.output) {
      return { url: status.output, duration: request.duration };
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "Video generation failed");
    }
  }

  throw new Error("Video generation timed out");
}

export function getVideoJob(id: string): VideoJob | undefined {
  return videoJobs.get(id);
}

export function listVideoJobs(): VideoJob[] {
  return [...videoJobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
}

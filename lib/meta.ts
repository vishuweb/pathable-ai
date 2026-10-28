import "server-only";
import OpenAI from "openai";

// The Meta Model API is OpenAI-compatible, so the official SDK works with a custom base URL.
export const META_BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL ?? "muse-spark-1.3";
export const SEGMENTATION_MODEL = process.env.SEGMENTATION_MODEL ?? "sam-3.1";

export class MissingApiKeyError extends Error {
  constructor() {
    super("MODEL_API_KEY is not set. Add it to .env.local (see .env.example).");
    this.name = "MissingApiKeyError";
  }
}

let client: OpenAI | undefined;

export function getMetaClient(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  client ??= new OpenAI({
    apiKey,
    baseURL: META_BASE_URL,
    timeout: 90_000,
    maxRetries: 1,
  });
  return client;
}

export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.MODEL_API_KEY);
}

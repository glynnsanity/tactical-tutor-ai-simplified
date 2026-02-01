import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 8787))
    .refine((v) => Number.isFinite(v) && v > 0, 'PORT must be a positive number'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MODEL_NAME: z.string().optional().default('claude-sonnet-4-20250514'),
  OPENAI_BASE_URL: z.string().optional().default('https://api.openai.com/v1'),
  OPENAI_ORG_ID: z.string().optional(),
  MAX_TOKENS: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 1024))
    .refine((v) => Number.isFinite(v) && v > 0, 'MAX_TOKENS must be a positive number'),
});

const parsed = EnvSchema.parse(process.env);

export const env = {
  PORT: parsed.PORT as number,
  OPENAI_API_KEY: parsed.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY,
  MODEL_NAME: parsed.MODEL_NAME,
  OPENAI_BASE_URL: parsed.OPENAI_BASE_URL,
  OPENAI_ORG_ID: parsed.OPENAI_ORG_ID,
  MAX_TOKENS: parsed.MAX_TOKENS as number,
};



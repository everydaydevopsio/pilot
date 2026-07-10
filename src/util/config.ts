import { z } from 'zod';

const ConfigSchema = z.object({
  cdpPort: z.number().int().min(1).max(65535).default(9222),
  cdpHost: z.string().default('127.0.0.1'),
  cdpRetryMs: z.number().int().min(100).default(2000),
  cdpMaxRetryMs: z.number().int().min(1000).default(30000),
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  chromePath: z.string().optional(),
  headless: z.boolean().default(true),
  profileName: z.string().default('profile1'),
  viewport: z.string().default('desktop'),
  responsive: z.boolean().optional()
});

export type Config = z.infer<typeof ConfigSchema>;

export interface CliArgs {
  cdpPort?: number;
  cdpHost?: string;
  logLevel?: string;
  chromePath?: string;
  headless?: boolean;
  profileName?: string;
  viewport?: string;
  responsive?: boolean;
}

export function loadConfig(cliArgs: CliArgs = {}): Config {
  const env = {
    cdpPort: process.env.AAB_CDP_PORT
      ? parseInt(process.env.AAB_CDP_PORT, 10)
      : undefined,
    cdpHost: process.env.AAB_CDP_HOST,
    cdpRetryMs: process.env.AAB_CDP_RETRY_MS
      ? parseInt(process.env.AAB_CDP_RETRY_MS, 10)
      : undefined,
    cdpMaxRetryMs: process.env.AAB_CDP_MAX_RETRY_MS
      ? parseInt(process.env.AAB_CDP_MAX_RETRY_MS, 10)
      : undefined,
    logLevel: process.env.AAB_LOG_LEVEL,
    chromePath: process.env.AAB_CHROME_PATH,
    headless:
      process.env.AAB_HEADLESS !== undefined
        ? process.env.AAB_HEADLESS !== 'false'
        : undefined,
    profileName: process.env.AAB_PROFILE_NAME,
    viewport: process.env.AAB_VIEWPORT,
    responsive:
      process.env.AAB_RESPONSIVE !== undefined
        ? process.env.AAB_RESPONSIVE !== 'false'
        : undefined
  };

  const merged = {
    cdpPort: cliArgs.cdpPort ?? env.cdpPort,
    cdpHost: cliArgs.cdpHost ?? env.cdpHost,
    cdpRetryMs: env.cdpRetryMs,
    cdpMaxRetryMs: env.cdpMaxRetryMs,
    logLevel: cliArgs.logLevel ?? env.logLevel,
    chromePath: cliArgs.chromePath ?? env.chromePath,
    headless: cliArgs.headless ?? env.headless,
    profileName: cliArgs.profileName ?? env.profileName,
    viewport: cliArgs.viewport ?? env.viewport,
    responsive: cliArgs.responsive ?? env.responsive
  };

  return ConfigSchema.parse(merged);
}

import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(8765),
  host: z.string().default('127.0.0.1'),
  cdpPort: z.number().int().min(1).max(65535).default(9222),
  cdpHost: z.string().default('127.0.0.1'),
  cdpRetryMs: z.number().int().min(100).default(2000),
  cdpMaxRetryMs: z.number().int().min(1000).default(30000),
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  launchChrome: z.boolean().default(true),
  chromePath: z.string().optional(),
  headless: z.boolean().default(true)
});

export type Config = z.infer<typeof ConfigSchema>;

export interface CliArgs {
  port?: number;
  host?: string;
  cdpPort?: number;
  cdpHost?: string;
  logLevel?: string;
  launchChrome?: boolean;
  chromePath?: string;
  headless?: boolean;
}

export function loadConfig(cliArgs: CliArgs = {}): Config {
  const env = {
    port: process.env.AAB_PORT ? parseInt(process.env.AAB_PORT, 10) : undefined,
    host: process.env.AAB_HOST,
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
    launchChrome:
      process.env.AAB_LAUNCH_CHROME !== undefined
        ? process.env.AAB_LAUNCH_CHROME !== 'false'
        : undefined,
    chromePath: process.env.AAB_CHROME_PATH,
    headless:
      process.env.AAB_HEADLESS !== undefined
        ? process.env.AAB_HEADLESS !== 'false'
        : undefined
  };

  const merged = {
    port: cliArgs.port ?? env.port,
    host: cliArgs.host ?? env.host,
    cdpPort: cliArgs.cdpPort ?? env.cdpPort,
    cdpHost: cliArgs.cdpHost ?? env.cdpHost,
    cdpRetryMs: env.cdpRetryMs,
    cdpMaxRetryMs: env.cdpMaxRetryMs,
    logLevel: cliArgs.logLevel ?? env.logLevel,
    launchChrome: cliArgs.launchChrome ?? env.launchChrome,
    chromePath: cliArgs.chromePath ?? env.chromePath,
    headless: cliArgs.headless ?? env.headless
  };

  return ConfigSchema.parse(merged);
}

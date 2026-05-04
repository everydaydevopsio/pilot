import pino from 'pino';

let _logger: pino.Logger | null = null;

export function createLogger(level = 'info'): pino.Logger {
  // Always write to stderr: this is an MCP server that communicates over stdio,
  // so stdout must carry only MCP protocol messages. pino-pretty is a
  // devDependency and is not available in production/global installs.
  _logger = pino({ level }, process.stderr);
  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

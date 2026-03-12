import pino from 'pino';

let _logger: pino.Logger | null = null;

export function createLogger(level = 'info'): pino.Logger {
  _logger = pino({
    level,
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
  });
  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

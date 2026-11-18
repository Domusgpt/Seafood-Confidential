import 'server-only';
import { trace } from '@opentelemetry/api';
import pino from 'pino';
import { DESK_VERSION } from './env';

// Structured JSON logs with trace correlation. Contact details, tokens and cookies are redacted by
// path; callers should still avoid logging personal data in the first place.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'sc-desk', version: DESK_VERSION },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      'authorization',
      'cookie',
      'token',
      'secret',
      'email',
      'password',
      '*.authorization',
      '*.cookie',
      '*.token',
      '*.secret',
      '*.email',
      '*.password',
      '*.submitterEmail',
      '*.privateContact',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[redacted]',
  },
  mixin() {
    const context = trace.getActiveSpan()?.spanContext();
    return context ? { trace_id: context.traceId, span_id: context.spanId } : {};
  },
});

import type { Instrumentation } from 'next';
import { registerOTel } from '@vercel/otel';

// OpenTelemetry traces for requests, Server Actions and fetches. Export is configured by the
// standard OTEL_* environment variables (e.g. OTEL_EXPORTER_OTLP_ENDPOINT); without them spans are
// created for log correlation but not exported.
export function register() {
  registerOTel({ serviceName: 'sc-desk', attributes: { 'service.version': '0.5.0' } });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logger } = await import('@/lib/logger');
  const err = error as Error & { digest?: string };
  logger.error(
    {
      request_id: request.headers['x-request-id'],
      method: request.method,
      path: request.path.split('?')[0],
      route: context.routePath,
      route_type: context.routeType,
      digest: err.digest,
      err: { name: err.name, message: err.message },
    },
    'request failed',
  );
};

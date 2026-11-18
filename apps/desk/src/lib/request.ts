import 'server-only';
import { headers } from 'next/headers';
import { env } from './env';
import { clientAddressFrom, REQUEST_ID_HEADER, resolveRequestId } from './security';

/** The correlation ID the proxy assigned to this request (minted here if the proxy did not run). */
export async function getRequestId(): Promise<string> {
  const h = await headers();
  return resolveRequestId(h.get(REQUEST_ID_HEADER));
}

/** Client address for intake throttling, honouring only the configured number of trusted proxies. */
export async function getClientAddress(): Promise<string> {
  const h = await headers();
  return clientAddressFrom(h.get('x-forwarded-for'), env().DESK_TRUSTED_PROXY_HOPS);
}

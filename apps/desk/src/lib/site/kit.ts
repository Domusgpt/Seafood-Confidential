// Kit (newsletter) broadcasts, API v4: POST https://api.kit.com/v4/broadcasts with X-Kit-Api-Key.
// The desk schedules the broadcast a few minutes ahead, which leaves a short window to stop it in
// Kit. With no subscriber filter, Kit sends to every subscriber (per the API reference).

export class KitError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** True when Kit may have created the broadcast before the failure: never resend automatically. */
    readonly outcomeUnknown: boolean,
  ) {
    super(message);
    this.name = 'KitError';
  }
}

export interface BroadcastInput {
  subject: string;
  previewText: string;
  html: string;
  description: string;
  sendAt: Date;
  emailTemplateId?: number | null;
  segmentId?: number | null;
}

export class KitClient {
  private readonly fetchImpl: typeof fetch;
  constructor(
    private readonly apiKey: string,
    opts: { fetch?: typeof fetch; baseUrl?: string } = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.base = (opts.baseUrl ?? 'https://api.kit.com').replace(/\/+$/, '');
  }
  private readonly base: string;

  async createBroadcast(input: BroadcastInput): Promise<{ id: string }> {
    const body = {
      subject: input.subject.slice(0, 250),
      preview_text: input.previewText.slice(0, 250),
      content: input.html,
      description: input.description.slice(0, 250),
      public: false,
      published_at: new Date().toISOString(),
      send_at: input.sendAt.toISOString(),
      ...(input.emailTemplateId ? { email_template_id: input.emailTemplateId } : {}),
      ...(input.segmentId
        ? {
            subscriber_filter: [
              { all: [{ type: 'segment', ids: [input.segmentId] }], any: null, none: null },
            ],
          }
        : {}),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v4/broadcasts`, {
        method: 'POST',
        headers: {
          'X-Kit-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch (error) {
      throw new KitError(`Kit did not answer: ${(error as Error).message}`, null, true);
    }
    const text = await res.text();
    if (!res.ok) {
      let message = `Kit answered ${res.status}.`;
      try {
        const parsed = JSON.parse(text) as { errors?: string[] | { message?: string }[] };
        const first = parsed.errors?.[0];
        if (first) message = typeof first === 'string' ? first : (first.message ?? message);
      } catch {
        // keep the status message
      }
      throw new KitError(message.slice(0, 300), res.status, res.status >= 500);
    }
    const parsed = JSON.parse(text) as { broadcast?: { id?: number | string } };
    if (parsed.broadcast?.id === undefined)
      throw new KitError('Kit did not return a broadcast ID.', res.status, true);
    return { id: String(parsed.broadcast.id) };
  }
}

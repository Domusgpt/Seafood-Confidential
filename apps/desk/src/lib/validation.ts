import { z } from 'zod';
import { extractGhostPostId } from './ghost';
import {
  AGENT_PROCESSING,
  AGENT_SCOPES,
  ASSET_KINDS,
  FOCI,
  FORMAT_HINTS,
  FORMATS,
  ITEM_STATUSES,
  keysOf,
  PERMITTED_USES,
  PITCH_DECISIONS,
  PROVENANCE,
  RIGHTS_STATUSES,
  SECTIONS,
  SOURCE_TYPES,
} from './vocab';

// Form schemas. Bounds mirror the database constraints so users get a field message instead of a
// constraint error; the database still enforces every bound independently.

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} can be at most ${max} characters.`);

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} can be at most ${max} characters.`).optional();

const isoDate = (label: string) => z.iso.date({ error: `${label} must be a date (YYYY-MM-DD).` }).optional();

export const pitchSchema = z.object({
  name: text(1, 120, 'Your name'),
  email: z.email({ error: 'Enter an email address we can reply to.' }).trim().max(254),
  affiliation: optionalText(200, 'Affiliation'),
  subject: text(3, 200, 'Subject'),
  readerQuestion: text(10, 1000, 'The reader question'),
  firsthandBasis: text(10, 2000, 'Your firsthand basis'),
  formatHint: z.enum(keysOf(FORMAT_HINTS)).optional(),
  interests: optionalText(1000, 'Interests'),
  consent: z.literal('on', { error: 'We can only review a pitch if we may contact you about it.' }),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional(),
});
export type PitchInput = z.infer<typeof pitchSchema>;

export const signInSchema = z.object({
  email: z.email({ error: 'Enter your work email address.' }).trim().max(254),
});

export const dispositionSchema = z.object({
  pitchId: z.uuid(),
  decision: z.enum(keysOf(PITCH_DECISIONS), { error: 'Choose a decision.' }),
  note: optionalText(2000, 'Note'),
  title: z.string().trim().min(3, 'A working title needs at least 3 characters.').max(180).optional(),
  section: z.enum(keysOf(SECTIONS)).optional(),
  format: z.enum(keysOf(FORMATS)).optional(),
  editorId: z.uuid().optional(),
});

export const itemFieldsSchema = z.object({
  title: text(3, 180, 'Title'),
  summary: optionalText(1000, 'Summary'),
  section: z.enum(keysOf(SECTIONS), { error: 'Choose a section.' }),
  format: z.enum(keysOf(FORMATS), { error: 'Choose a format.' }),
  focus: z.enum(keysOf(FOCI)).optional(),
  dueOn: isoDate('Due date'),
  assignedEditorId: z.uuid().optional(),
  authorDisplay: optionalText(200, 'Byline'),
  region: optionalText(400, 'Regions'),
  species: optionalText(400, 'Species'),
});

export const itemUpdateSchema = itemFieldsSchema.extend({
  itemId: z.uuid(),
  status: z.enum(keysOf(ITEM_STATUSES), { error: 'Choose a status.' }),
});

export const ghostLinkSchema = z.object({
  itemId: z.uuid(),
  ghostPost: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null;
      const id = extractGhostPostId(value);
      if (!id) {
        ctx.addIssue({
          code: 'custom',
          message: 'Paste the 24-character Ghost post ID or the Ghost editor URL.',
        });
        return z.NEVER;
      }
      return id;
    }),
});

export const sourceSchema = z.object({
  itemId: z.uuid(),
  sourceCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SRC-[A-Z0-9-]{3,40}$/, 'Use a source ID like SRC-NOAA-2026-01.'),
  sourceType: z.enum(keysOf(SOURCE_TYPES), { error: 'Choose a source type.' }),
  title: text(3, 300, 'Source title'),
  publisher: optionalText(200, 'Publisher'),
  url: z
    .url({ protocol: /^https?$/, error: 'Use a full http(s) address.' })
    .max(2000)
    .optional(),
  publishedOn: isoDate('Published date'),
  accessedOn: isoDate('Accessed date'),
  claimSupported: optionalText(2000, 'Claim supported'),
  locationInSource: optionalText(300, 'Location in source'),
  agentProcessing: z.enum(keysOf(AGENT_PROCESSING), { error: 'Choose who may process this source.' }),
  privateContact: optionalText(500, 'Private contact'),
  privateNotes: optionalText(4000, 'Private notes'),
});

export const rightsSchema = z.object({
  itemId: z.uuid(),
  assetLabel: text(2, 200, 'Asset label'),
  assetKind: z.enum(keysOf(ASSET_KINDS), { error: 'Choose the asset kind.' }),
  provenance: z.enum(keysOf(PROVENANCE), { error: 'Choose the provenance.' }),
  ownerName: optionalText(200, 'Rights holder'),
  license: optionalText(200, 'License'),
  creditLine: optionalText(300, 'Credit line'),
  permittedUses: z.array(z.enum(keysOf(PERMITTED_USES))).default([]),
  restrictions: optionalText(1000, 'Restrictions'),
  status: z.enum(keysOf(RIGHTS_STATUSES), { error: 'Choose a rights status.' }),
  consentReference: optionalText(500, 'Consent reference'),
});

export const agentCreateSchema = z.object({
  name: text(1, 120, 'Agent name'),
  scopes: z.array(z.enum(keysOf(AGENT_SCOPES))).min(1, 'Choose at least one scope.'),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const proposalReviewSchema = z.object({
  proposalId: z.uuid(),
  decision: z.enum(['accepted', 'rejected']),
});

/** Turn FormData into a plain object: blank strings become undefined; repeated keys become arrays. */
export function formToObject(formData: FormData, arrayFields: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION')) continue;
    const values = formData.getAll(key).filter((v): v is string => typeof v === 'string');
    if (arrayFields.includes(key)) {
      out[key] = values.filter((v) => v.trim() !== '');
    } else {
      const v = values[0];
      out[key] = v === undefined || v.trim() === '' ? undefined : v;
    }
  }
  for (const key of arrayFields) out[key] ??= [];
  return out;
}

export type { FieldErrors, FormState } from './form-state';
import type { FieldErrors } from './form-state';

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

/** Split a comma-separated tag field into a bounded, de-duplicated list. */
export function splitTags(value: string | undefined, max = 20): string[] {
  if (!value) return [];
  const tags = value
    .split(',')
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t.length > 0 && t.length <= 60);
  return [...new Set(tags)].slice(0, max);
}

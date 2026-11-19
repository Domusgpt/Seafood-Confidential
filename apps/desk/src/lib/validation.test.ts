import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  formToObject,
  ghostLinkSchema,
  pitchSchema,
  rightsSchema,
  sourceSchema,
  splitTags,
} from './validation';

const pitch = {
  name: 'Jordan Grower',
  email: 'jordan@example.test',
  subject: 'Oyster leases',
  readerQuestion: 'What does a renewal change?',
  firsthandBasis: 'I run an oyster lease.',
  consent: 'on',
};

describe('pitch intake validation', () => {
  it('accepts a complete pitch', () => {
    expect(pitchSchema.safeParse(pitch).success).toBe(true);
  });

  it('requires consent to be contacted', () => {
    const result = pitchSchema.safeParse({ ...pitch, consent: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).consent).toMatch(/contact you/);
  });

  it('bounds every field like the database does', () => {
    expect(pitchSchema.safeParse({ ...pitch, subject: 'x'.repeat(201) }).success).toBe(false);
    expect(pitchSchema.safeParse({ ...pitch, firsthandBasis: 'x'.repeat(2001) }).success).toBe(false);
    expect(pitchSchema.safeParse({ ...pitch, email: 'not-an-email' }).success).toBe(false);
    expect(pitchSchema.safeParse({ ...pitch, formatHint: 'video-upload' }).success).toBe(false);
  });

  it('rejects a filled honeypot', () => {
    expect(pitchSchema.safeParse({ ...pitch, website: 'https://spam.example' }).success).toBe(false);
  });
});

describe('source and rights records', () => {
  it('normalizes source IDs and refuses non-http URLs', () => {
    const ok = sourceSchema.safeParse({
      itemId: '00000000-0000-4000-8000-000000000000',
      sourceCode: 'src-noaa-2026-01',
      sourceType: 'official_document',
      title: 'Landings',
      agentProcessing: 'no',
    });
    expect(ok.success && ok.data.sourceCode).toBe('SRC-NOAA-2026-01');
    const js = sourceSchema.safeParse({
      itemId: '00000000-0000-4000-8000-000000000000',
      sourceCode: 'SRC-X-01',
      sourceType: 'other',
      title: 'Bad link',
      url: 'javascript:alert(1)',
      agentProcessing: 'no',
    });
    expect(js.success).toBe(false);
  });

  it('accepts only known permitted uses', () => {
    const base = {
      itemId: '00000000-0000-4000-8000-000000000000',
      assetLabel: 'Dock',
      assetKind: 'photo',
      provenance: 'documentary',
      status: 'pending',
    };
    expect(rightsSchema.safeParse({ ...base, permittedUses: ['web', 'social'] }).success).toBe(true);
    expect(rightsSchema.safeParse({ ...base, permittedUses: ['billboard'] }).success).toBe(false);
  });

  it('reduces a pasted Ghost URL to its post ID', () => {
    const id = '0123456789abcdef01234567';
    const parsed = ghostLinkSchema.safeParse({
      itemId: '00000000-0000-4000-8000-000000000000',
      ghostPost: `https://x.test/ghost/#/editor/post/${id}`,
    });
    expect(parsed.success && parsed.data.ghostPost).toBe(id);
    expect(
      ghostLinkSchema.safeParse({ itemId: '00000000-0000-4000-8000-000000000000', ghostPost: 'nope' })
        .success,
    ).toBe(false);
  });
});

describe('form helpers', () => {
  it('turns blank fields into undefined and collects arrays', () => {
    const fd = new FormData();
    fd.append('title', '  ');
    fd.append('name', 'Riley');
    fd.append('permittedUses', 'web');
    fd.append('permittedUses', 'print');
    fd.append('$ACTION_ID_abc', 'x');
    expect(formToObject(fd, ['permittedUses', 'scopes'])).toEqual({
      title: undefined,
      name: 'Riley',
      permittedUses: ['web', 'print'],
      scopes: [],
    });
  });

  it('splits, trims and de-duplicates tags', () => {
    expect(splitTags(' Gulf of Maine,  Bristol Bay ,Gulf of Maine,, ')).toEqual([
      'Gulf of Maine',
      'Bristol Bay',
    ]);
    expect(splitTags(undefined)).toEqual([]);
  });
});

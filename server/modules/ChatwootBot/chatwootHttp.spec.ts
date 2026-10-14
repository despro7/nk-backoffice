import { describe, expect, it } from 'vitest';
import {
  formatChatwootHttpError,
  sanitizeChatwootApiToken,
} from './chatwootHttp.js';

describe('chatwootHttp', () => {
  it('sanitizeChatwootApiToken strips whitespace and newlines', () => {
    expect(sanitizeChatwootApiToken('  abc\r\n\t')).toBe('abc');
  });

  it('formatChatwootHttpError summarizes HTML nginx 400', () => {
    const html = '<!DOCTYPE html><html><head><title> 400 Bad Request </title></head></html>';
    const msg = formatChatwootHttpError(400, '/conversations/1/messages', html, 'POST');
    expect(msg).toContain('400');
    expect(msg).toContain('400 Bad Request');
    expect(msg).not.toContain('<!DOCTYPE');
  });
});

import fs from 'fs';
import path from 'path';

describe('changelog secret redaction', () => {
  it('does not keep a setlist.fm API key in the working tree changelog', () => {
    const changelog = fs.readFileSync(path.resolve(__dirname, '../../../../CHANGELOG.md'), 'utf8');
    const embedsProviderToken = /API Key:\s*`[^`\s]{16,}`/.test(changelog);

    expect(embedsProviderToken).toBe(false);
    expect(changelog.includes('SETLISTFM_API_KEY')).toBe(true);
  });
});

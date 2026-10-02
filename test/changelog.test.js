'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { release } = require('../lib/changelog');

const CHANGELOG = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Fixed',
    '',
    '- Something was broken',
    '',
    '## [1.0.0] - 2026-01-01',
    '',
    '### Added',
    '',
    '- First release',
    '',
    '[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD',
    '[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0',
    '',
].join('\n');

const OPTIONS = { version: '1.1.0', tag: 'v1.1.0', date: '2026-10-02' };

test('moves the Unreleased entries under the new version and updates the links', () => {
    const result = release(CHANGELOG, OPTIONS);

    assert.equal(result.changed, true);
    assert.equal(result.linksUpdated, true);
    assert.equal(
        result.text,
        [
            '# Changelog',
            '',
            '## [Unreleased]',
            '',
            '## [1.1.0] - 2026-10-02',
            '',
            '### Fixed',
            '',
            '- Something was broken',
            '',
            '## [1.0.0] - 2026-01-01',
            '',
            '### Added',
            '',
            '- First release',
            '',
            '[Unreleased]: https://github.com/example/project/compare/v1.1.0...HEAD',
            '[1.1.0]: https://github.com/example/project/compare/v1.0.0...v1.1.0',
            '[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0',
            '',
        ].join('\n')
    );
});

test('returns the released entries as the release notes', () => {
    assert.equal(release(CHANGELOG, OPTIONS).notes, '### Fixed\n\n- Something was broken');
});

test('uses the tag as given in the links', () => {
    const { text } = release(CHANGELOG, { version: '1.1.0', tag: '1.1.0', date: '2026-10-02' });

    assert.match(text, /^\[Unreleased\]: https:\/\/github\.com\/example\/project\/compare\/1\.1\.0\.\.\.HEAD$/m);
    assert.match(text, /^\[1\.1\.0\]: https:\/\/github\.com\/example\/project\/compare\/v1\.0\.0\.\.\.1\.1\.0$/m);
});

test('leaves the changelog alone when nothing is unreleased', () => {
    const empty = CHANGELOG.replace('### Fixed\n\n- Something was broken\n\n', '');
    const result = release(empty, OPTIONS);

    assert.equal(result.changed, false);
    assert.equal(result.text, empty);
    assert.equal(result.notes, '');
});

test('leaves the changelog alone when the version is already released', () => {
    const result = release(CHANGELOG, { version: '1.0.0', tag: 'v1.0.0', date: '2026-10-02' });

    assert.equal(result.changed, false);
    assert.equal(result.text, CHANGELOG);
});

test('throws when there is no Unreleased heading', () => {
    assert.throws(() => release('# Changelog\n\n## [1.0.0] - 2026-01-01\n', OPTIONS), /Keep a Changelog/);
});

test('adds the heading but leaves the links alone when there is no Unreleased link', () => {
    const unlinked = CHANGELOG.replace(/^\[Unreleased\]:.*\n/m, '');
    const result = release(unlinked, OPTIONS);

    assert.equal(result.changed, true);
    assert.equal(result.linksUpdated, false);
    assert.match(result.text, /^## \[1\.1\.0\] - 2026-10-02$/m);
    assert.doesNotMatch(result.text, /^\[1\.1\.0\]:/m);
});

test('releases an Unreleased section that is the last one in the file', () => {
    const result = release('# Changelog\n\n## [Unreleased]\n\n- First release\n', OPTIONS);

    assert.equal(result.text, '# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-10-02\n\n- First release\n');
});

test('stops the Unreleased section at the link definitions', () => {
    const result = release(
        '## [Unreleased]\n\n- First release\n\n[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD\n',
        OPTIONS
    );

    assert.equal(result.notes, '- First release');
    assert.match(result.text, /- First release\n\n\[Unreleased\]: /);
});

test('keeps Windows line endings', () => {
    const result = release(CHANGELOG.replace(/\n/g, '\r\n'), OPTIONS);

    assert.match(result.text, /\r\n/);
    assert.doesNotMatch(result.text, /[^\r]\n/);
});

'use strict';

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ACTION = path.join(__dirname, '..', 'index.js');

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function tempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    TEMP_DIRS.push(dir);
    return dir;
}

// Keep the developer's own git configuration ( hooks, signing, default branch ) out of the test repositories
const GIT_ENV = { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };

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
    '- First release',
    '',
    '[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD',
    '[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0',
    '',
].join('\n');

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A bare repository stands in for GitHub, and a clone of it for the actions/checkout workspace
function setup() {
    const dir = tempDir('keepachangelog-release-');
    const origin = path.join(dir, 'origin.git');
    const workspace = path.join(dir, 'workspace');

    git(dir, 'init', '--bare', '--initial-branch=main', origin);
    git(dir, 'clone', origin, workspace);
    git(workspace, 'config', 'user.name', 'Test');
    git(workspace, 'config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(workspace, 'CHANGELOG.md'), CHANGELOG);
    git(workspace, 'add', 'CHANGELOG.md');
    git(workspace, 'commit', '-m', 'Initial commit');
    git(workspace, 'push', 'origin', 'main');

    return { dir, origin, workspace };
}

function runAction(workspace, inputs = {}) {
    const output = tempDir('keepachangelog-output-');
    const outputFile = path.join(output, 'output');
    fs.writeFileSync(outputFile, '');

    const result = spawnSync(process.execPath, [ACTION], {
        cwd: workspace,
        encoding: 'utf8',
        env: {
            ...process.env,
            ...GIT_ENV,
            GITHUB_WORKSPACE: workspace,
            GITHUB_OUTPUT: outputFile,
            'INPUT_RELEASE-TAG': 'v1.1.0',
            'INPUT_RELEASE-DATE': '2026-10-02',
            INPUT_CHANGELOG: 'CHANGELOG.md',
            ...inputs,
        },
    });

    return { ...result, outputs: fs.readFileSync(outputFile, 'utf8') };
}

function output(outputs, name) {
    const match = outputs.match(new RegExp(`^${name}<<(\\S+)\\n([\\s\\S]*?)\\n\\1$`, 'm'));
    return match && match[2];
}

test('commits the released changelog and pushes it with [skip ci]', () => {
    const { origin, workspace } = setup();

    const result = runAction(workspace);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(git(origin, 'log', '-1', '--format=%s', 'main'), 'Update changelog for v1.1.0 [skip ci]');
    assert.equal(git(origin, 'log', '-1', '--format=%an', 'main'), 'github-actions[bot]');
    assert.match(git(origin, 'show', 'main:CHANGELOG.md'), /^## \[1\.1\.0\] - 2026-10-02$/m);
    assert.equal(output(result.outputs, 'changed'), 'true');
    assert.equal(output(result.outputs, 'version'), '1.1.0');
    assert.equal(output(result.outputs, 'release-notes'), '### Fixed\n\n- Something was broken');
});

test('a second run for the same release pushes nothing', () => {
    const { origin, workspace } = setup();

    runAction(workspace);
    const tip = git(origin, 'rev-parse', 'main');
    const result = runAction(workspace);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(git(origin, 'rev-parse', 'main'), tip);
    assert.equal(output(result.outputs, 'changed'), 'false');
});

test('rebases onto commits pushed to the branch in the meantime', () => {
    const { dir, origin, workspace } = setup();

    const other = path.join(dir, 'other');
    git(dir, 'clone', origin, other);
    git(other, 'config', 'user.name', 'Test');
    git(other, 'config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(other, 'README.md'), 'Pushed while the release was running\n');
    git(other, 'add', 'README.md');
    git(other, 'commit', '-m', 'Add README');
    git(other, 'push', 'origin', 'main');

    const result = runAction(workspace);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(git(origin, 'log', '--format=%s', 'main'), 'Update changelog for v1.1.0 [skip ci]\nAdd README\nInitial commit');
    assert.equal(git(origin, 'rev-list', '--merges', 'main'), '');
});

test('fails without pushing when HEAD is detached', () => {
    const { origin, workspace } = setup();
    git(workspace, 'checkout', '--detach');
    const tip = git(origin, 'rev-parse', 'main');

    const result = runAction(workspace);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^::error::HEAD is detached/m);
    assert.equal(git(origin, 'rev-parse', 'main'), tip);
});

test('fails when the release-tag input is missing', () => {
    const { workspace } = setup();

    const result = runAction(workspace, { 'INPUT_RELEASE-TAG': '' });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /^::error::The "release-tag" input is required/m);
});

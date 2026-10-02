'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { release } = require('./lib/changelog');

// The runner passes inputs as INPUT_<NAME> environment variables, upper cased with spaces turned into underscores
function input(name, fallback = '') {
    const value = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
    return value && value.trim() !== '' ? value.trim() : fallback;
}

function setOutput(name, value) {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) return;
    const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
    fs.appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function run() {
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const tag = input('release-tag');
    if (!tag) throw new Error('The "release-tag" input is required');
    const version = tag.replace(/^v/, '');
    const changelog = input('changelog', 'CHANGELOG.md');
    const date = input('release-date', new Date().toISOString().slice(0, 10));

    let branch;
    try {
        branch = git(workspace, 'symbolic-ref', '--short', 'HEAD');
    } catch {
        throw new Error('HEAD is detached, check out the branch to update with the "ref" input of actions/checkout ( e.g. "ref: main" )');
    }

    const file = path.join(workspace, changelog);
    const result = release(fs.readFileSync(file, 'utf8'), { version, tag, date });

    setOutput('version', version);
    setOutput('changed', result.changed ? 'true' : 'false');
    setOutput('release-notes', result.notes);

    if (!result.changed) {
        console.log(`${changelog} left as it is: ${result.reason}`);
        return;
    }
    if (!result.linksUpdated) {
        console.log(`No "[Unreleased]: <url>/compare/<tag>...HEAD" link in ${changelog}, so the compare links were left as they are`);
    }

    fs.writeFileSync(file, result.text);

    git(workspace, 'config', 'user.name', 'github-actions[bot]');
    git(workspace, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    git(workspace, 'add', '--', changelog);

    // Pushes made with the default GITHUB_TOKEN never start workflow runs,
    // "[skip ci]" covers checkouts that used a personal access token instead
    git(workspace, 'commit', '-m', `Update changelog for ${tag} [skip ci]`);
    git(workspace, 'pull', '--rebase', 'origin', branch);
    git(workspace, 'push', 'origin', `HEAD:refs/heads/${branch}`);

    console.log(`Released the Unreleased entries in ${changelog} as ${version} and pushed to ${branch}`);
}

try {
    run();
} catch (error) {
    const message = error.stderr ? `${error.message.split('\n')[0]}: ${error.stderr.trim()}` : error.message;
    console.log(`::error::${message.replace(/\r?\n/g, '%0A')}`);
    process.exitCode = 1;
}

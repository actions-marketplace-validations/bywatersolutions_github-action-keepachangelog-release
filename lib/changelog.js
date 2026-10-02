'use strict';

// Releases the "## [Unreleased]" section of a Keep a Changelog file ( https://keepachangelog.com )

const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/i;
const HEADING = /^## /;
const LINK_DEFINITION = /^\[[^\]]+\]:\s/;
const ENTRY = /^\s*[-*] /;
const UNRELEASED_LINK = /^\[Unreleased\]:\s*(\S+)\/compare\/(\S+?)\.\.\.HEAD\s*$/i;

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimBlankLines(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start].trim() === '') start++;
    while (end > start && lines[end - 1].trim() === '') end--;
    return lines.slice(start, end);
}

/**
 * Moves the entries under "## [Unreleased]" under a new "## [version] - date" heading
 * and points the compare links at the new tag.
 *
 * Returns { text, changed, reason, notes, linksUpdated }, where notes is the released section.
 */
function release(text, { version, tag, date }) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);

    const start = lines.findIndex((line) => UNRELEASED_HEADING.test(line));
    if (start === -1) {
        throw new Error('No "## [Unreleased]" heading found, the changelog is not in Keep a Changelog format');
    }

    const released = new RegExp(`^## \\[${escapeRegExp(version)}\\]`);
    if (lines.some((line) => released.test(line))) {
        return { text, changed: false, reason: `${version} is already in the changelog`, notes: '', linksUpdated: false };
    }

    // The Unreleased section ends at the next heading, or at the link definitions when it is the only section
    let end = lines.findIndex((line, index) => index > start && (HEADING.test(line) || LINK_DEFINITION.test(line)));
    if (end === -1) end = lines.length;

    const entries = trimBlankLines(lines.slice(start + 1, end));
    if (!entries.some((line) => ENTRY.test(line))) {
        return { text, changed: false, reason: 'there is nothing under Unreleased', notes: '', linksUpdated: false };
    }

    const rest = lines.slice(end);
    const updated = [...lines.slice(0, start + 1), '', `## [${version}] - ${date}`, '', ...entries, ...(rest.length ? [''] : []), ...rest];

    // Keep the file's final newline when the Unreleased section ran to the end of it
    if (lines[lines.length - 1] === '' && updated[updated.length - 1] !== '') updated.push('');

    let linksUpdated = false;
    const link = updated.findIndex((line) => UNRELEASED_LINK.test(line));
    if (link !== -1) {
        const [, base, previous] = updated[link].match(UNRELEASED_LINK);
        updated.splice(link, 1, `[Unreleased]: ${base}/compare/${tag}...HEAD`, `[${version}]: ${base}/compare/${previous}...${tag}`);
        linksUpdated = true;
    }

    return {
        text: updated.join(eol),
        changed: true,
        reason: `released the Unreleased entries as ${version}`,
        notes: entries.join(eol),
        linksUpdated,
    };
}

module.exports = { release };

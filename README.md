# Keep a Changelog Release

This action keeps a [Keep a Changelog](https://keepachangelog.com) file in step with your releases.
When a release is published it moves everything under `## [Unreleased]` under a new
`## [VERSION] - DATE` heading, points the compare links at the new tag, then commits and
pushes the change to the checked out branch.

The push never starts another workflow run (see [Requirements](#requirements)).

It is a plain JavaScript action with no dependencies, so there is nothing to install or build.

## What it does

Publishing `v1.1.0` turns this:

```markdown
## [Unreleased]

### Fixed

- Something was broken

## [1.0.0] - 2026-01-01

[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0
```

into this:

```markdown
## [Unreleased]

## [1.1.0] - 2026-10-02

### Fixed

- Something was broken

## [1.0.0] - 2026-01-01

[Unreleased]: https://github.com/example/project/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/example/project/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0
```

The changelog is left alone when there is nothing under `[Unreleased]`, or when the version
already has a heading, so re-running a release is safe. If there is no
`[Unreleased]: <url>/compare/<tag>...HEAD` link the heading is still added and the links are
left as they are.

## Inputs

### `release-tag`

**Required** Tag of the release being published, e.g. `v1.0.3`. The changelog version is the
tag without a leading `v`, the compare links use the tag as given.

### `changelog`

**Optional** Path to the changelog, relative to the repository root. Defaults to `CHANGELOG.md`.

### `release-date`

**Optional** Date for the new version heading as `YYYY-MM-DD`. Defaults to today ( UTC ).

## Outputs

### `changed`

`true` if the changelog was updated and pushed, `false` if nothing was unreleased or the
version was already in it.

### `version`

Version used for the new heading, e.g. `1.0.3`.

### `release-notes`

The entries released under the new heading, as Markdown.

## Example usage

```yaml
on:
  release:
    types: [published]

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.repository.default_branch }}

      - uses: bywatersolutions/github-action-keepachangelog-release@v1
        with:
          release-tag: ${{ github.event.release.tag_name }}
```

If your release workflow runs on tag pushes instead, use `release-tag: ${{ github.ref_name }}`
and still check out the branch with `ref: main` ( or whatever your default branch is ).

## Requirements

- **Check out the branch, not the tag.** A tag checkout leaves `HEAD` detached, and the action
  fails rather than guess where to push. Use the `ref` input of `actions/checkout`.
- **The job needs `permissions: contents: write`** so the default `GITHUB_TOKEN` can push.
- **No extra workflow runs.** GitHub does not start workflow runs for pushes made with the
  default `GITHUB_TOKEN`. The commit message also ends in `[skip ci]`, so `push` and
  `pull_request` workflows are skipped even if you check out with a personal access token
  ( e.g. to get past branch protection ).
- The commit is rebased onto the branch before it is pushed, so commits that landed while the
  release was running are kept.

## Development

```sh
npm test
```

The tests use Node's built in test runner. `test/action.test.js` runs the action against a
local bare repository, so it covers the commit, rebase and push as well.

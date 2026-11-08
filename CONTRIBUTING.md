# Contributing

Thanks for helping with OSS Activity Card. Bug reports, ideas and pull requests are all welcome.

## Issues

- **Bugs:** use the bug report form. A link to where the card is shown helps the most, plus a screenshot for anything visual.
- **Ideas:** use the feature request form. Say what you want to show on your profile, not only the option you have in mind.
- Issues labeled [`good first issue`](https://github.com/yamamoto7/oss-activity-card/labels/good%20first%20issue) are a good place to start.

For a large change, open an issue first so we can agree on the approach before you spend time on it.

## Development

Requires Node.js 24. TypeScript runs directly on Node, with no compile step for tests.

```sh
npm install
npm run check      # typecheck, tests and build, the same as CI
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (`node --test`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Bundles `src/` into `dist/index.js`, which the action runs |
| `npm run example` | Renders `examples/card-*.svg` from sample data |

To render a card for a real user:

```sh
npm run build
GITHUB_TOKEN=$(gh auth token) INPUT_USER=<username> node dist/index.js
```

This writes `oss-card.svg` and `oss-card-dark.svg` in the current directory. Open them in a browser to check.

### Where things are

| File | Role |
| --- | --- |
| `src/main.ts` | Action entry point: reads inputs, writes files |
| `src/github.ts` | GitHub API calls |
| `src/config.ts` | Parses and validates `.github/oss-card.yml` |
| `src/select.ts` | Decides what the card shows: ordering, visibility, limits |
| `src/render.ts` | Draws the SVG, as one image or one image per row |
| `src/readme.ts` | Writes the linked card into the README |
| `test/` | Tests, with sample data in `test/fixtures.ts` |

## Pull requests

1. Branch from `dev` and open the pull request against `dev`. `main` only moves on releases.
2. Add or update tests for what you change.
3. Run `npm run build` and commit `dist/`. GitHub runs the action from the repository as-is, and CI fails if `dist/` doesn't match the source.
4. If the card looks different, run `npm run example`, commit the updated `examples/card-*.svg`, and add a screenshot to the pull request.
5. If you add or change an option, update the README and `examples/oss-card.yml`.

### Things to keep in mind

- **GitHub shows the card as an image.** It strips scripts, external images and most HTML. Anything new has to work inside an SVG loaded by `<img>`, in both light and dark themes.
- **Linked rows must line up.** Each row is a separate image, so a change to the layout must keep the rows stacking without gaps. `test/render.test.ts` checks that the slices add up to the full card.
- **Keep dependencies small.** The action is bundled into one file. Avoid adding a runtime dependency unless it saves a lot of code.
- **Don't break configs.** Existing `.github/oss-card.yml` files should keep working within a major version.

## Releases

The maintainer releases by merging `dev` into `main` and pushing a version tag. See [Branches and releases](README.md#branches-and-releases).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By taking part, you agree to follow it.

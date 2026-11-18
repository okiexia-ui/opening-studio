# GitHub release preparation

Public source repository: https://github.com/okiexia-ui/opening-studio

Each release is prepared as a GitHub draft, checked, then published. Packaging
only creates local archives; publishing the draft is a separate maintainer action.

Render the demo set (frost from the root composition, the others from
`film/variants`, all with default options) before packaging with demos:

```sh
node scripts/hf.cjs render --quality delivery --fps 60 -o '../delivery/Welcome Tommy.mp4'
node scripts/hf.cjs render variants/ink --quality delivery --fps 60 -o '../delivery/Ink Landscape.mp4'
# … aurora → Aurora Field, terminal → Phosphor Terminal, civic → Great Wall Pass,
#   spell → Candlelit Spell, voyage → Planetary Voyage, neon → Neon Rain, claude → Claude Ink
```

## Reproduce artifacts

```sh
npm ci
python3 scripts/make-variants.py
npm run check
zsh scripts/build-native.sh --universal
python3 scripts/test-integration.py
python3 scripts/test-install.py
python3 scripts/package-release.py --require-demos
```

The package script allowlists sources, preserves command executability,
excludes local caches/logs and creates SHA-256 checksums. A release with demos requires all eight styles plus the Claude example. CI
can build the app and source archives from a clean checkout without rendered MP4s. `release/manifest.json` records artifact contents.
GitHub Actions builds and uploads archives; it does not publish a release.

## Publish when a repository has been chosen

1. Review README, third-party notices and `docs/RELEASE_NOTES.md`.
2. Commit the source with the supplied `.gitignore`. Keep `release/` out of
   Git history; attach its archives as release assets instead.
3. Push to the chosen repository. Create a release tagged `v0.3.0` with
   `docs/RELEASE_NOTES.md` as its body.
4. Attach the archives and `SHA256SUMS.txt`. Keep it as a draft while checking
   the downloaded archive and installation on another Mac.

The build has not been Developer ID signed or notarized. Wider binary
release can use your own Apple signing identity and notarization workflow;
never commit signing credentials. Source builds need no Developer account.

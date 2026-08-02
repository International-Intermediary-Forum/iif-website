# Project agent instructions

## Current state

- This repository is the future website for the International Intermediary Forum.
- The production site is dependency-free HTML, CSS, and JavaScript in `public/`. npm is used only for deployment tooling.
- `assets/ChatGPT Image Aug 3, 2026, 10_46_03 AM.png` is the visual and content reference; it is not deployed.

## Implementation

- Keep changes small and directly tied to the request.
- Match the reference's restrained navy, pale blue, white, and gold visual language when implementing the site.
- Recreate the reference as responsive, semantic UI; do not ship the screenshot as the page or embed its text in an image.
- Preserve supplied copy unless the user asks for editorial changes.
- Treat mobile, keyboard navigation, focus states, readable contrast, and reduced-motion preferences as baseline requirements.
- Prefer simple local assets and platform features over new dependencies. Explain any dependency that materially increases the bundle or maintenance burden.

## Repository hygiene

- Do not modify or replace source assets unless the task requires it.
- Keep generated output, dependency directories, local environment files, and secrets out of version control.
- Update this file when the project gains a framework, canonical commands, deployment details, or architectural conventions.

## Verification

- Run the local Cloudflare Pages server with `npm run dev`.
- Run JavaScript syntax validation with `npm test`.
- Deployments run from GitHub Actions on pushes to `main`; `npm run deploy` is the manual equivalent.
- For UI work, also verify the relevant page at narrow and wide viewport sizes and check the browser console.
- Report commands run and any checks that could not be performed.

# Project agent instructions

## Current state

- This repository is the future website for the International Intermediary Forum.
- The production site is dependency-free HTML, CSS, and JavaScript in `public/`. npm is used only for deployment and test tooling.
- `assets/ChatGPT Image Aug 3, 2026, 10_46_03 AM.png` is the visual and content reference; it is not deployed.
- Production is the Cloudflare Pages project `iif-website`, served at `https://internationalintermediaryforum.org`. Plain HTTP and `www` redirect to that address through Cloudflare zone settings (Always Use HTTPS and a redirect rule), not repository config. `iif-website.pages.dev` is still publicly reachable.
- `public/404.html` is served with a 404 status for any missing path at any depth, so every URL on that page must be root-relative.

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
- Run the Playwright browser checks in `tests/site-test.js` with `npm run test:browser` (against `npm run dev`) or `npm run test:live` (against production). They cover desktop, mobile, and 320px widths: images, overflow, the sticky header, navigation, keyboard focus rings, the 404 page, social tags, console and CSP errors, and, live only, the domain redirects. Install browsers once with `npx playwright install`; Chromium falls back to an installed Microsoft Edge, and missing engines are reported as SKIP. Limit engines with `node tests/site-test.js <url> --engines=chromium`. Update the checks when the content they assert changes.
- Deployments run from GitHub Actions on pushes to `main`; `npm run deploy` is the manual equivalent. CI runs `npm test` only, not the browser checks.
- For UI work, also verify the relevant page at narrow and wide viewport sizes and check the browser console; the browser checks cover the current page.
- Report commands run and any checks that could not be performed.

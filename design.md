# design.md

## 1. Project
- Name: Envoy Vault (Envoy Pay)
- Site type: Web3 / dev-tool product, a live app with a short intro above it
- One-sentence description: A USDC vault on Arc that lets an AI agent spend within a hard cap per window, only to allowlisted payees, with every payment and rejection logged on-chain. Built for developers and for hackathon reviewers.
- Primary goal: A reviewer understands the product in 30 seconds, then sees it working on the live dashboard.
- Primary CTA: "Open the dashboard" (scrolls to the dashboard)
- Secondary CTA: "View the contract" (explorer link, from src/config.ts) and "GitHub repo"
- Target audience: Technical (developers, crypto-literate hackathon reviewers). Many will open it with no wallet installed, on desktop or phone.

## 2. Output
- Prototype format: Keep the existing Vite + React app. Restyle in place. No framework change.
- Pages: single page. Intro sections, then the existing dashboard.
- Responsive: both, mobile layouts must be usable
- Light, dark, or both: dark only for now, built on tokens so a light theme can be added later

## 3. References
| # | URL or screenshot | Take this | Avoid this |
|---|---|---|---|
| 1 | useselo.xyz | grid-line rails, dark dev-tool feel | copying its layout or copy |
| 2 | (my reference here) | | |
| 3 | (my reference here) | | |

- Anti-references: neon crypto sites, glowing gradients everywhere, busy animated backgrounds, and anything with low-contrast grey-on-black text.

## 4. Look and feel
- Overall look: dark, technical, precise
- 3 adjectives: sleek, trustworthy, calm
- Motion level: subtle hover and reveal only
- Effects: thin grid lines and rails, one restrained accent, no glow, no parallax
- Layout style: grid-line rails, bento-style cards for dashboard stats

## 5. Brand
- Logo: simple wordmark "Envoy Vault", propose a small mark
- Colors: propose. Palette is near-black, blues, and tones of white. No red, pink, yellow or green anywhere in the palette. Status uses blue and white tones plus icons and text labels, never color alone.
- Fonts: propose, self-hosted via the npm package. No Google Fonts or other external requests.
- Tone: confident, plain, technical

## 6. Sections (in order)
1. Nav (Overview, How it works, Dashboard, GitHub, plus a visible network badge reading the chain name from src/config.ts, for example "Arc Testnet")
2. Hero (headline, subtext, both CTAs)
3. How it works (3 steps: fund the vault, set limits and payees, the agent pays within the rules)
4. Safety and limits (what it enforces on-chain, and honest known limits)
5. Dashboard (the existing app, restyled, all behavior unchanged)
6. Footer (repo, contract link, "not audited, hackathon project")

## 7. Content
- Headline idea: "Give your agent a budget, not your wallet."
- Key points: hard cap per window enforced on-chain; payee allowlist; every payment and rejection logged; pause, revoke and withdraw at any time by the owner; immutable contract
- Real facts: runs on Arc, USDC for payments and gas, one agent per vault, fixed spending window
- Do not claim: audited, production-ready, endorsed by or affiliated with Circle or Arc, "unhackable", or any security guarantee. Do not state any number the app cannot show.

## 8. Constraints
- Must-have: WCAG 2.2 AA, keyboard-operable, visible focus, readable on a phone, fast load, no new external requests (fonts, CDNs, analytics). The /rpc proxy in vercel.json must keep working.
- Tech limits: static Vercel deploy, no backend. src/config.ts stays the single source for chain, RPC and address values.
- Deadline: about two days. Keep scope small.

## 9. How to work
- Ask me before building if something is unclear
- Deliver in two passes: (1) design system and tokens, (2) intro sections and dashboard restyle
- After each pass: list assumptions and what you would change next
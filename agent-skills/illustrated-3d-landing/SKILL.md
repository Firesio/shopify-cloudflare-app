---
name: illustrated-3d-landing
description: Build a "3D landing page" in the painted, cinematic parallax style (Kage-like) - hand-painted illustration plates and cut-out layers moved by a real three.js camera as you scroll, a giant app name sitting between the layers, and one meaningful animation per chapter. Use this whenever the user asks for a 3D landing page, a scroll-driven 3D or parallax landing, a "Kage style" or illustrated/painted/cinematic landing, an awwwards-style hero with layered artwork, or says they want a landing page that "looks like Kage", even if they do not name the technique and even if they do not say where the artwork will come from (Gemini, ChatGPT, Midjourney, an API, a designer, or Playwright driving a generator are all fine).
---

# Illustrated 3D landing (painted parallax world)

## What this produces

One persistent three.js world, scrolled like a film:

- **Plates**: 2-3 full-bleed painted backdrops (wide scene, closer scene, dawn scene) that crossfade by chapter.
- **Cut-outs**: 5-6 transparent painted pieces (string of lanterns, leafy branch, grass, awning, crates, a small flying thing) placed at *different depths*, so the moving camera parallaxes them at different speeds. This depth difference is what reads as "3D"; one flat image never does.
- **The name** of the product, huge, sits *between* plate and cut-outs, so foreground pieces cover part of it.
- **Chapters**: each chapter is a camera shot plus a state per cut-out (enter, leave, move) plus one animation that means something about the product (e.g. each painted lantern glows like an incoming order).
- Fireflies, falling leaves, film grain, word-by-word headings. A static poster is the first frame, so the page is complete without JavaScript or WebGL.

The look that is non-negotiable: painted not photographic, deep indigo/teal with one warm light and one accent, calm and cinematic, thin uppercase type with small technical labels, generous dark space for copy.

The theme (what the painted world shows) is free. It should be a place that *rhymes with the product*: a night market for a store app, a harbour for logistics, an observatory for analytics. Keep the structure, change the world.

## Why this design (so you can adapt it sensibly)

- Parallax needs real depth, so cut-outs are separate transparent images, never baked into the plate.
- A moving camera, not CSS transforms, because one camera move parallaxes every layer consistently and lets chapters feel like different shots of the same place.
- Painted assets, not drawn-in-code art: procedural silhouettes (a code-drawn city, particle shapes) were tried and read as cheap. Quality comes from the artwork; the code only moves it. If there is no art yet, say so plainly; do not fake it with code-drawn illustration.
- Everything is one scroll value -> a "stage" number (0..N). Same scroll position always gives the same frame, forwards or backwards.

## Workflow

Work through these in order. Skip a step only when the user already has its output.

### 0. Intake (ask only what you cannot infer)

The product and its one primary action; the audience; any real proof (never invent testimonials or logos, label placeholders as placeholders); the theme world; **where the art will come from** (see step 2); the target (standalone page or a route inside an existing app, and that repo's rules, e.g. an `AGENTS.md`); the languages the copy must support.

### 1. Direction note (write it before art or code)

A short note: visual thesis, theme world, palette, the plates, the cut-outs, and a **chapter table**: for each chapter the camera shot, which cut-outs enter/leave, and the one meaningful animation. Reject a chapter that differs from the previous only by copy. Use `references/engine-notes.md` for the pattern and `landing-page`-style structure (hero with headline + one CTA + risk reversal + one proof signal, then chapters, proof, plans if relevant, FAQ, final CTA).

### 2. Get the art

Read `references/acquiring-art.md`. The route is the user's choice and all are valid: they generate with the prompts, or you drive their chosen generator with Playwright, or a generation API/CLI they have, or licensed assets. Prompts and the cut-out rules are in `references/art-pack.md` and work in any generator. Never hard-wire the page to one generator.

### 3. Process the art

`scripts/process_art.py` converts plates to 2400 px JPEG and keys cut-outs (flat magenta -> transparent with edge-fringe removal), trims and resizes them to WebP. `assets/tools/cutout.html` does the keying in a browser if Python is unavailable. Look at every cut-out over a dark background before using it.

### 4. Build from the template

Copy `assets/template/index.html` next to an `art/` folder. Fetch three.js once (`vendor/three.module.min.js`, r170, MIT) rather than using a CDN at runtime. Then adapt: file names, the `LAYERS` table (per-chapter keys), `SHOTS`, the chapter copy, and the lantern/glow anchor points, which are measured from *your* art. `references/engine-notes.md` explains each knob and the numbers that worked.

### 5. Verify honestly

Check each chapter at desktop width and at phone width, the console, horizontal overflow, keyboard focus and reduced motion. A hidden or background browser pane does not run animation frames: wake it with a short `requestAnimationFrame` loop before screenshotting. State what you did not verify (real-GPU frame rate, phone, reduced-motion, WebGL failure) instead of implying it passed.

### 6. Productionise (when it goes into a real app)

The template is a prototype. In a real repo, follow that repo's rules for public pages (styles, tokens, i18n, dark mode, performance budget, asset licences, no placeholder values left behind) before shipping. Say that the prototype does not meet them until it is rewritten.

## Pitfalls that cost time before

- **Do not read data out of a logged-in page and post it elsewhere with page JavaScript** (e.g. fetch to localhost, window.open). The page's CSP blocks it and the host may deny it; do not hunt for ways around it. Use real downloads (Playwright) or ask the user to download.
- **The in-app browser pane does not save downloads** to disk. Playwright does.
- **Full-size downloads can carry a ghost of the previous image in the same chat** (seen on cut-outs). Generate each cut-out in a fresh chat, or one image per chat, and look at the file, not only the on-screen preview.
- **The generator's corner mark** is removed by cropping 6-8% off the edges, which parallax needs anyway; do not paint over it.
- **Cut-out glow bleeds into the key colour.** Tell the generator that light stays inside the object; use a high tolerance only for amber/warm objects.
- Plates are about 2400 px wide and get upscaled about 1.3x at the nearest camera position. Mention it; do not hide it with a bigger claim.
- Portrait/phone layout needs its own check: cut-out sizes are relative to `max(viewW, viewH*1.1)` and were only verified on desktop in the first build.
- Place headings and body copy on the quiet part of the plate (the prompts reserve it) and add a soft scrim; copy over busy painted detail is unreadable.

# Art pack: prompts that work in any image generator

These were written for Gemini and gave a consistent, clean set. They are plain English, so paste them into ChatGPT/DALL-E, Midjourney, Flux, an API, or hand them to an illustrator. Replace the **theme** sentences, keep the rules.

## Contents
1. Style anchor
2. Plates
3. Cut-outs
4. Rules that decide quality
5. Theme swaps
6. File names the template expects

## 1. Style anchor (send first, once)

> You are painting one cohesive set of cinematic illustrations for a website. Style: painterly 2D digital illustration, clean soft shading, subtle paper-like texture, like a modern animated-film background. Palette: deep indigo and teal night, warm amber lantern light, one coral-red accent, a pale moon. Mood: calm, quiet, slightly mysterious. No people. No text, letters, logos, watermarks or UI anywhere. Keep exactly this style, palette and lighting in every image I ask for next. Reply "ready" and wait.

Change palette and mood to match the product; keep "painterly", "no people", "no text", and one warm light plus one accent.

If images will be downloaded one per fresh chat (see `acquiring-art.md`), fold the anchor into each prompt instead: "Generate an image. Style: ... Cutout: ...".

## 2. Plates (3, 16:9, opaque, ask for the largest size)

- **plate-hero**: the establishing shot of the theme world from a low wide angle, a big light source (moon/sun) in the upper right, strong depth (dark foreground, warm glowing middle, cool misty distance). **Keep the upper-left third calm and almost empty (the headline goes there).**
- **plate-market** (or "plate-close"): the same place, closer, intimate and warmer, the light source out of frame. **Keep the left third darker and quieter.**
- **plate-dawn**: the same place at first light from a height; pale peach and teal sky. **Keep the centre quiet (a call to action goes there).**

Each prompt ends: "No people, no text."

## 3. Cut-outs (5-6, flat magenta background)

Append to every cut-out prompt:

> Isolated on a perfectly flat, solid pure magenta background (#FF00FF). Hard clean edges. No shadow, no glow, no gradient and no texture on the background. Any light the object gives off stays inside the object. Do not use magenta or pink anywhere in the object.

Pieces and framing (in the night-market theme):

| name | shape | prompt core |
|---|---|---|
| cut-lanterns | wide strip ~3:1 | a sagging rope with five to seven glowing paper lanterns of different sizes, running diagonally, rope leaving the frame on both sides |
| cut-leaves | ~1:1 | a maple branch from the top-right corner, coral and amber leaves, a few falling |
| cut-grass | wide strip ~3:1 | tall dark grass and ferns along the bottom edge, deep teal with a thin rim light, uneven height |
| cut-crates | ~1:1 | a stack of wooden crates and tied paper parcels, a small lantern on top, sitting at the bottom of the frame |
| cut-awning | ~1:1 | the corner of a striped awning with two small lanterns, coming in from the top-left, in shadow with warm light on the edge |
| cut-drone | ~1:1 | a small delivery drone carrying a tied parcel and a lantern, single object centred with empty space around it |

Pick pieces so that **every screen edge has something to enter from**: top (rope/branch), sides, bottom (grass/crates), plus one free-flying piece.

## 4. Rules that decide quality

- One chat for the style, but **one cut-out per fresh chat when downloading full-size files**: later cut-outs in a long chat came back with a ghost of the previous image in the lower part of the download (the on-screen preview was clean).
- A cut-out must not contain the key colour or anything near it (no pink/magenta lanterns glow; coral is fine, hot pink is not).
- Ask for the object fully inside the frame except pieces that are meant to leave it (rope, branch, awning).
- If a result is not flat magenta behind: "Same image, but the background must be perfectly flat solid #FF00FF with nothing else on it."
- Never accept text, logos or people in the output; regenerate.
- Check the licence/terms of the generator plan for commercial use and record the source in the project README.

## 5. Theme swaps

Keep structure (3 plates + edge pieces + one free-flyer + a lantern-like "pulse" element), change the world:

| product | world | pulse element | free-flyer |
|---|---|---|---|
| store / orders app | hillside night market | paper lanterns (one per order) | delivery drone |
| shipping / logistics | harbour at night | buoy and ship lights | gull or cargo kite |
| analytics | mountain observatory | star-map lamps | paper balloon |
| support / inbox | lighthouse coast | lighthouse beams | sea bird |

The "pulse element" is what gets pinned glows and "+1" tags in the Signal chapter; choose an object that sits on a single cut-out so the glows can be pinned to measured points.

## 6. File names the template expects

```
art/plate-hero.jpg  art/plate-market.jpg  art/plate-dawn.jpg
art/cut-lanterns.webp  art/cut-leaves.webp  art/cut-grass.webp
art/cut-crates.webp    art/cut-awning.webp  art/cut-drone.webp
art/leaf-single.webp   (one leaf cropped from cut-leaves, used for falling leaves)
```

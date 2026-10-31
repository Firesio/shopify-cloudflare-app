# Engine notes (the template in `assets/template/index.html`)

## Contents
- World layout and numbers
- The per-chapter key table
- Stage from scroll
- Pinned glows and "+1" tags
- Adapting to new art
- Accessibility, fallback, lifecycle
- Testing in a hidden browser pane

## World layout and numbers

Camera: perspective, 40 deg, starts at z=0 looking down -z.

| thing | z | notes |
|---|---|---|
| plates | -40 (stacked at -40.1, -40.2) | covers the view at 1.34x so the camera can travel; crossfade by stage |
| wordmark (canvas text) | -34 | behind every cut-out; fades out after the hero |
| cut-outs | -14 (grass, nearest) ... -26 (lanterns, farthest) | the camera ends near z=-10, so keep every cut-out beyond it |
| fireflies | -42 ... -12 | additive points, twinkling |
| falling leaves | -30 ... -16 | small planes, count follows the chapter |

Keep all cut-outs further than the camera's final z, or they will be passed (and vanish behind the lens). Parallax strength comes from depth difference: nearer pieces move more.

## The per-chapter key table

Each cut-out has `edge` (top, top-left, top-right, bottom, bottom-left, free), `bias` (how far past the edge it hangs, as a fraction of its own size), `enter` (offset it starts from at load) and `keys`: one `[dx, dy, w, opacity, rotation]` per chapter.

- `dx`, `dy` are multiples of the cut-out's own width/height (positive = right/up). Use about 1.2 to push a piece fully off screen. For `free` pieces they are fractions of the viewport.
- `w` is a fraction of `U = max(viewW, viewH*1.1)` at that depth.
- Between chapters the key values interpolate, so a piece "leaves" or "arrives" just by differing between two chapters. That is the whole enter/exit system; there are no separate tweens.
- The load-in animation is `enter` scaled by an eased intro progress with a per-layer delay.

Sizes that worked at 16:9 desktop: lanterns w=.86 (bias .16), leaves w=.38, awning w=.5, crates w=.36, grass w=1.05 (bias .14), drone w=.24-.3. The first guesses (lanterns 1.12, leaves .6) were far too big.

## Stage from scroll

Sections with `data-ch` are the chapters, in order. The stage is the fractional index of the section whose centre the viewport centre is between (`i + t`). It is smoothed (`lerp .07`) for camera and visuals only. Camera, plate opacity, particle amounts and cut-out keys are all functions of the same stage, so the page is deterministic and reversible. Final sections (plans, FAQ) may be given the same shot as the last chapter.

## Pinned glows and "+1" tags

The Signal chapter's meaning is "each lantern is an order". Glows are additive planes parented to the lantern cut-out at measured (u, v) points (`LANTS`), so they move with it. Measure the points on **your** art (view it over a dark background and read off fractions of width/height). Tags project a glow's world position to the screen and animate a small DOM chip upward. Change the pulse element to fit the theme, or remove the glows if the art has no obvious pulse object.

## Adapting to new art

1. Rename files in the `Promise.all` loader list and `LAYERS`.
2. Re-check each cut-out's `edge`, size and keys on screen; most first guesses are too large.
3. Re-measure `LANTS`.
4. Rewrite the copy; keep the structure (hero headline + CTA + risk line + proof line; chapters; proof; plans; FAQ; final CTA). Leave placeholders obviously marked.
5. The three.js module must be local (`vendor/three.module.min.js`, import map). No runtime CDN.

## Accessibility, fallback, lifecycle

- Headings are split into words by script; the element keeps an `aria-label` with the full text and the split spans are `aria-hidden`.
- A CSS poster (`plate-hero`) is the first frame; the canvas fades in over it. If WebGL or an image fails, the poster and all copy remain.
- `prefers-reduced-motion`: no intro, stage snaps to the nearest chapter, no sway/falling/twinkle motion, draw on scroll only, grain animation off.
- Pause when `document.hidden` or when the canvas is off screen; cap DPR at 1.75 and lower it if frames exceed about 40 ms; handle `webglcontextlost`; dispose on `pagehide`.
- One decision to state to users: the template uses native scroll and CSS, not GSAP/Lenis, to keep the page light. Add them only if the project already uses them.

## Testing in a hidden browser pane

A pane that is not visible does not run animation frames. Before a screenshot, evaluate a short loop in the page:

```js
new Promise(r => { const t = performance.now(); (function f(){ performance.now()-t > 7000 ? r(1) : requestAnimationFrame(f) })(); setTimeout(() => r(0), 10000) })
```

Scroll with `element.scrollIntoView({block:'center', behavior:'instant'})` (set `scroll-behavior:auto` first) and wait one loop per chapter, because the stage is smoothed. Screenshots taken at the instant of navigation show the intro mid-way and are misleading.

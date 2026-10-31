# Getting the artwork

The page works with whatever produced the files. Offer the options, let the user choose, and never make the generator a hard dependency.

## Contents
- A. The user generates (always works)
- B. You drive their generator with Playwright (untested here, see caveats)
- C. A generation API or CLI the user has
- D. Licensed or commissioned art
- What went wrong the first time

## A. The user generates

Give them `references/art-pack.md` adapted to the theme, written into the project (e.g. `docs/.../ART_PROMPTS.md`) so it survives the chat, plus `assets/tools/cutout.html` for keying. Tell them the exact file names and the folder. This is the most reliable route because it uses their login and their download button.

## B. Drive their generator with Playwright

Why Playwright: it can save real downloads to a folder you choose, which the in-app browser pane could not.

Shape of the flow (the generator's UI changes often, so inspect before scripting):

1. Launch a **headed** persistent context so the user logs in once and the session is reused (`launchPersistentContext(userDataDir, {headless:false})`). Never type or store the user's password; let them sign in by hand.
2. Open the generator's chat, send the prompt, wait for the image to finish.
3. Use the image's own **download** control inside `page.waitForEvent('download')`, then `download.saveAs(path)`.
4. One image per fresh chat for cut-outs (see "ghost" below). Verify each saved file's dimensions and look at it.

Caveats, so you report them honestly:
- This was **not tested end to end** with Playwright; the first build drove the in-app browser for generation only, and the user downloaded by hand.
- Generators may rate-limit, change the DOM, or forbid automation in their terms. Check, and fall back to A.
- Ask before downloading and before using the user's logged-in account; sending prompts and saving files is the scope, nothing else.

## C. API or CLI

If the user already has an image API key or a CLI (the video that inspired this used a CLI that fans out to several models), use it with the same prompts. Request the largest size and transparent or flat-magenta output. Keep keys in the environment, never in the repo.

## D. Licensed or commissioned art

Public CC0 sets were checked and rejected for this style: the layered sets on OpenGameArt were pixel art, flat cartoon, or blobby renders, none cinematic. If using licensed art, it must come as separable transparent layers; record licence and author in the README. Photographs (e.g. CC0 panoramas) are a different look and do not meet "painted illustration".

## What went wrong the first time (so you can avoid it)

- Page JavaScript on the logged-in Gemini page tried to send the images to a localhost receiver: blocked by the page's CSP, and a second attempt to bridge through an iframe was refused by the host. Do not repeat this. Use downloads.
- The in-app browser pane did not write downloaded files to disk.
- Downloaded full-size files (2752x1536 plates, 2048x2048 square cut-outs, 3584x1184 strips) were far larger than the on-screen preview (about 1024 px). Three early cut-outs in a long chat had ghosts of the previous image; regenerating in fresh chats fixed it.
- Files arrive in reverse order of creation and with random names. Identify each by looking at it; do not assume the order.

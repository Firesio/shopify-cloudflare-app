# Illustration assets

## Setup guide onboarding

- File: `public/illustrations/undraw/setup-analytics.svg`
- Source: https://undraw.co/illustrations/setup-analytics.svg
- Collection: [unDraw](https://undraw.co/illustrations)
- License: review the current unDraw license before redistribution or branding changes.

Use this asset for onboarding/setup-guide content where the merchant configures their first workflow. Keep the alt text translated and describe the purpose rather than the artwork:

```tsx
<s-image
  src="/illustrations/undraw/setup-analytics.svg"
  alt={t("setupGuide.illustrationAlt")}
  aspectRatio="1/0.75"
  objectFit="contain"
  loading="lazy"
></s-image>
```

## Online search

Search current provider results without maintaining a local catalog:

```bash
npm run illustrations:search -- "onboarding setup" --limit 10
```

This fetches the public unDraw search page, extracts direct CDN SVG URLs, and prints the source and license link. Select a result, download it through its direct URL, and record the title, source page, license, and local filename here. Always check the provider's current license before shipping.

## Quick online search and download

```bash
npm run illustrations:search -- "onboarding setup" --limit 10
npm run illustrations:download -- "https://cdn.undraw.co/illustration/setup-wizard_45kx.svg" --out public/illustrations/onboarding.svg
```

Search results include the creator, license, source page, and direct download URL. The downloader accepts a selected URL, verifies that the response is an image, and writes it to the requested path. Record attribution and license details beside the asset or in this document.

## Dashboard setup guide

These local assets support the three sample onboarding steps in the embedded
dashboard. They were selected from unDraw search results and downloaded from the
listed CDN URLs.

| File                                     | Source page                                 | Download URL                                                  | License                                     |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `public/illustrations/onboarding.svg`    | https://undraw.co/search/setup              | https://cdn.undraw.co/illustration/onboarding_dcq2.svg        | [unDraw license](https://undraw.co/license) |
| `public/illustrations/catalog.svg`       | https://undraw.co/search/product            | https://cdn.undraw.co/illustration/product-explainer_b7ft.svg | [unDraw license](https://undraw.co/license) |
| `public/illustrations/analytics.svg`     | https://undraw.co/search/analytics          | https://cdn.undraw.co/illustration/analytics-setup_ptrz.svg   | [unDraw license](https://undraw.co/license) |
| `public/illustrations/support-empty.svg` | https://undraw.co/search/customer%20support | https://cdn.undraw.co/illustration/faq_pgxi.svg               | [unDraw license](https://undraw.co/license) |

## Plan cards (billing page)

Used by `app/components/billing/PlanCard.tsx`, chosen by plan **handle** (`ILLUSTRATIONS`, exhaustive over `PlanHandle`),
with translated alt text under `billing.plans.imageAlt.<handle>` in the `admin` catalogue.

| File | Plan handle | Source | License |
| --- | --- | --- | --- |
| `public/plan-cards/lv1.svg` | `free` | **Unknown.** Added in commit `c97e4fc` without a source. The SVG's layer ids (`freepik--background-complete--inject-*`) point to Freepik-style artwork, but no download URL, author or licence is recorded anywhere in the repo. | **Not recorded.** The owner must confirm the licence and attribution requirements before launch, or replace the file. |
| `public/plan-cards/lv2.svg` | `pro` | Unknown, as above | Not recorded, as above |

`lv3.svg` and `lv4.svg` were added in the same commit "for future plans", were never referenced, and were deleted. When a
third plan exists, add its file here with a recorded source and licence, then add its handle to `ILLUSTRATIONS`.

## App mark (placeholder)

The staff console's sidebar and sign-in use the Remix mark as a **placeholder**
until the app has its own logo (`app/internal/components/AppLogo.tsx`,
a single 24x24 path drawn with `currentColor`). Source: the `remix` icon from
[simple-icons](https://github.com/simple-icons/simple-icons) (CC0), fetched
from the pinned package on jsDelivr. The Remix name and mark are trademarks of
their owner; replace `LOGO_PATH` before shipping. The product name shown beside
it is `identity.brandName` in `app/identity.ts`.

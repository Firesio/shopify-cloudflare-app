/**
 * The app's own services, as TYPES the layers below the composition file can name (`app/firesio.server.ts` builds them in ONE factory,
 * `createFiresio({ services })`, and every entry point gets them beside the package's: a route, a job, an event handler, a flow, a mail hook, a setup step).
 * Declaring the type here, and not reading it back from `createFiresio`, is what keeps the composition file free of a circular type (TS7022): the mail kit
 * (`notifyKit<AppServices>()`), the checklist (`defineSetup<AppServices>`) and a flow (`flowKit<PresetFlowTypes<AppServices>>()`) are typed by it. The template's
 * two services are small on purpose; a feature adds its own beside them (`app/core/<feature>/ports.ts` for the port, `app/wiring/<feature>.ts` for the binding).
 */

/** The addresses of the app that its own code builds. */
export interface AppLinks {
  /**
   * Where a merchant opens the app from a mail: the app's own URL with `?shop=`, which the landing page sends on to `/app` and Shopify's library takes through
   * authentication into the embedded admin (`app/routes/public/landing.tsx`, `workers/routes.e2e.test.ts`). shopify.dev (searched 2026-11-22: App Home, Navigation, admin
   * links, Dev Dashboard, the `App` object) documents no URL of the form `https://<shop>/admin/apps/<id>` or `https://admin.shopify.com/store/<handle>/apps/<handle>` for
   * linking a merchant to an installed app, so the template builds none; its own, tested entry is used instead.
   */
  openAppUrl(shop: string): string;
}

export function appLinksFor(appUrl: string): AppLinks {
  return { openAppUrl: (shop) => `${appUrl.replace(/\/+$/, "")}/?shop=${encodeURIComponent(shop)}` };
}

/** What the onboarding checklist asks about a shop (`app/wiring/setup.ts`): each answer is one step's `done`. */
export interface Onboarding {
  /** The shop saved the general settings at least once. */
  settingsSaved(shop: string): Promise<boolean>;
  /** The shop wrote to support at least once. */
  contactedSupport(shop: string): Promise<boolean>;
}

export interface AppServices {
  readonly links: AppLinks;
  readonly onboarding: Onboarding;
}

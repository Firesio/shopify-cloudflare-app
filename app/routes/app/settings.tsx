import { createPage, defineSection, saveIntent, settleView, visibilityOf, type ValueOf, type Viewed } from "@firesio/app/settings";
import { fieldOf, select, settingsAction, SettingsForm, text, toggle } from "@firesio/app/ui/settings";
import { useLoaderData } from "react-router";
import { GENERAL_SETTINGS } from "~/core/settings";
import { firesio } from "~/firesio.server";

type GeneralView = Viewed<ValueOf<(typeof GENERAL_SETTINGS)["schema"]>>;
const field = fieldOf<GeneralView>();

// TODO: the app's own words (in the merchant's language, like the library pages' labels).
const FIELDS = [
  field("signature", { label: "Signature on mails", widget: text({ maxLength: 200 }) }),
  field("weeklySummary", { label: "Send me a weekly summary", widget: toggle() }),
  field("summaryDay", { label: "Day", widget: select({ options: [{ value: "monday", label: "Monday" }, { value: "friday", label: "Friday" }] }) }),
];

type Guarded = Parameters<Parameters<typeof firesio.loader>[1]>[0];

/**
 * The page's one section, built per request over this request's services, shop and member: `createPage` runs the load and the
 * save (`saveIntent`: per-field refusals, the revision guard, `clearWhen`), so the route has no code per field.
 */
function pageOf({ services, shop, member }: Guarded) {
  const general = defineSection({
    id: "general",
    permission: null,
    load: async () => services.settings.view(shop, GENERAL_SETTINGS),
    intents: { save: saveIntent(GENERAL_SETTINGS, { settings: services.settings, shop: () => shop, saver: () => ({ actor: `member:${member.id}`, allows: () => true }) }) },
  });
  return createPage({ sections: [general], context: () => null, can: () => true });
}

// `app:manage`: the firesio guard checks it (403 inside the layout) before the page is built.
export const loader = firesio.loader("app:manage", (args) => pageOf(args).loader(args));
export const action = firesio.action("app:manage", (args) => settingsAction(pageOf(args).action)(args));

export default function Settings() {
  const { views } = useLoaderData<typeof loader>();
  const view = views.general;
  return (
    <s-page heading="Settings">
      <s-section heading="General">
        {view === undefined ? null : (
          <SettingsForm
            id="general-settings"
            intent="general/save"
            value={view.value}
            revision={view.revision}
            fields={FIELDS}
            visibility={(value) => visibilityOf(GENERAL_SETTINGS, value)}
            settle={(value) => settleView(GENERAL_SETTINGS, value)}
          />
        )}
      </s-section>
    </s-page>
  );
}

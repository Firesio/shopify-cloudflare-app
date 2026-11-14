import type { MetaFunction } from "react-router";
import { identity } from "~/core/identity";

export const meta: MetaFunction = () => [{ title: `Terms of service - ${identity.name}` }];

/** Placeholder text a derived app replaces with its own terms (`docs/LEGAL_TEMPLATE.md`). */
export default function Terms() {
  return (
    <section className="section">
      <div className="prose stack">
        <h1>Terms of service</h1>
        <p className="notice notice--warning">Placeholder. Replace with the terms your lawyer approved before submitting the app for review.</p>
        <p>TODO: the agreement between {identity.companyName} and a merchant who installs {identity.name}.</p>
        <p>Effective {identity.legal.effectiveDate}. {identity.legal.address}.</p>
      </div>
    </section>
  );
}

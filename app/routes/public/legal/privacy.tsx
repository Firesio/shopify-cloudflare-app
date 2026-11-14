import type { MetaFunction } from "react-router";
import { identity } from "~/core/identity";

export const meta: MetaFunction = () => [{ title: `Privacy policy - ${identity.name}` }];

/** Placeholder text a derived app replaces with its own policy (`docs/LEGAL_TEMPLATE.md`). */
export default function Privacy() {
  return (
    <section className="section">
      <div className="prose stack">
        <h1>Privacy policy</h1>
        <p className="notice notice--warning">Placeholder. Replace with the policy your lawyer approved before submitting the app for review.</p>
        <p>TODO: who {identity.companyName} is, what data {identity.name} stores about a store and its team, why, for how long, who it is shared with, and how a merchant asks for its deletion.</p>
        <p>Effective {identity.legal.effectiveDate}. {identity.legal.address}.</p>
      </div>
    </section>
  );
}

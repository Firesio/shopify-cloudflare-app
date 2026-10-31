// Ring 1 — pure. Questions a catalogue can answer about itself: which plan unlocks a key, which plan has room for N, what
// a move from one plan to another changes, and whether the catalogue is consistent. Nothing here reads a subscription or
// a clock; `resolveEntitlement` answers what ONE shop may do, this answers what the PLANS offer.
import type { EntitlementCatalogue, EntitlementGrant, FeatureDefinition } from "./entitlement-policy";

export type GrantChangeKind = "gained" | "lost" | "increased" | "decreased";

export interface GrantChange {
  readonly key: string;
  readonly change: GrantChangeKind;
  readonly before: EntitlementGrant;
  readonly after: EntitlementGrant;
}

const DISABLED: EntitlementGrant = { kind: "disabled" };

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

const isCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/** How much a grant allows: nothing, a number, or no ceiling at all. A malformed limit allows nothing. */
function amountOf(grant: EntitlementGrant | undefined): number {
  if (grant === undefined || grant.kind === "disabled") return 0;
  if (grant.kind === "limit") return isCount(grant.maximum) ? grant.maximum : 0;
  return Number.POSITIVE_INFINITY;
}

function grantOf(catalogue: EntitlementCatalogue, plan: string, key: string): EntitlementGrant | undefined {
  const grants = own(catalogue.plans, plan);
  return grants === undefined ? undefined : own(grants, key);
}

/** The plans cheapest first: the declared `ladder`, else the order the plans were written in the catalogue. */
export function ladderOf(catalogue: EntitlementCatalogue): readonly string[] {
  return catalogue.ladder ?? Object.keys(catalogue.plans);
}

function grants(definition: FeatureDefinition, grant: EntitlementGrant | undefined): boolean {
  if (definition.kind === "capability") return grant !== undefined && (grant.kind === "enabled" || grant.kind === "unlimited");
  return amountOf(grant) > 0;
}

/** The first plan of the ladder that grants `key` (a limit of zero grants nothing): where to send a merchant who needs it. */
export function firstPlanGranting(catalogue: EntitlementCatalogue, key: string): string | null {
  const definition = own(catalogue.features, key);
  if (definition === undefined) return null;
  return ladderOf(catalogue).find((plan) => grants(definition, grantOf(catalogue, plan, key))) ?? null;
}

/** The first plan whose allowance for a capacity or quota covers `needed` (a positive whole number). */
export function firstPlanWithRoom(catalogue: EntitlementCatalogue, key: string, needed: number): string | null {
  const definition = own(catalogue.features, key);
  if (definition === undefined || definition.kind === "capability") return null;
  if (!Number.isSafeInteger(needed) || needed < 1) return null;
  return ladderOf(catalogue).find((plan) => amountOf(grantOf(catalogue, plan, key)) >= needed) ?? null;
}

function classify(before: number, after: number): GrantChangeKind | null {
  if (after === before) return null;
  if (after > before) return before === 0 ? "gained" : "increased";
  return after === 0 ? "lost" : "decreased";
}

/** What moving from plan `from` to plan `to` changes, in catalogue order, unchanged keys left out. Null for an unknown plan. */
export function grantsDiff(catalogue: EntitlementCatalogue, from: string, to: string): readonly GrantChange[] | null {
  if (own(catalogue.plans, from) === undefined || own(catalogue.plans, to) === undefined) return null;
  const changes: GrantChange[] = [];
  for (const key of Object.keys(catalogue.features)) {
    const before = grantOf(catalogue, from, key);
    const after = grantOf(catalogue, to, key);
    const change = classify(amountOf(before), amountOf(after));
    if (change !== null) changes.push({ key, change, before: before ?? DISABLED, after: after ?? DISABLED });
  }
  return changes;
}

function grantProblem(plan: string, key: string, definition: FeatureDefinition, grant: EntitlementGrant): string | null {
  if (definition.kind === "capability" && grant.kind === "limit") return `plan ${plan} grants ${key} (capability) a limit`;
  if (definition.kind !== "capability" && grant.kind === "enabled") return `plan ${plan} grants ${key} (${definition.kind}) enabled`;
  if (grant.kind === "limit" && !isCount(grant.maximum)) return `plan ${plan} has an invalid limit for ${key}`;
  return null;
}

/** Everything wrong with a catalogue, as sentences; empty when it is consistent. Run it in the app's own catalogue test. */
export function catalogueProblems(catalogue: EntitlementCatalogue): readonly string[] {
  const problems: string[] = [];
  const plans = Object.keys(catalogue.plans);
  if (catalogue.version !== 1) problems.push(`catalogue version ${catalogue.version} is not supported`);
  if (!plans.includes(catalogue.freePlan)) problems.push(`freePlan ${catalogue.freePlan} is not a plan`);
  if (catalogue.ladder !== undefined) {
    for (const name of catalogue.ladder) if (!plans.includes(name)) problems.push(`ladder names ${name}, which is not a plan`);
    for (const name of plans) if (!catalogue.ladder.includes(name)) problems.push(`ladder leaves out plan ${name}`);
  }
  for (const plan of plans) {
    for (const [key, definition] of Object.entries(catalogue.features)) {
      const grant = grantOf(catalogue, plan, key);
      if (grant === undefined) {
        problems.push(`plan ${plan} has no grant for ${key}`);
        continue;
      }
      const problem = grantProblem(plan, key, definition, grant);
      if (problem !== null) problems.push(problem);
    }
  }
  return problems;
}

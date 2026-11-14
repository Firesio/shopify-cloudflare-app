import type { D1StatementLike } from "@firesio/portal-client/d1";

/**
 * `enqueueStatement` and the libraries' statement builders return the structural `D1StatementLike`; `D1Database.batch` takes the
 * real prepared statement. A statement made by `env.DB.prepare` always is one: this narrows with a type guard instead of a cast, and
 * fails loudly if a fake ever reaches production wiring.
 */
function isPrepared(statement: D1PreparedStatement | D1StatementLike): statement is D1PreparedStatement {
  return "raw" in statement && typeof statement.raw === "function";
}

export function prepared(statements: readonly (D1PreparedStatement | D1StatementLike)[]): D1PreparedStatement[] {
  return statements.map((statement) => {
    if (!isPrepared(statement)) throw new TypeError("a D1 batch needs prepared statements");
    return statement;
  });
}

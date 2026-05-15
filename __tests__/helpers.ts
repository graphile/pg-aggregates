import { Pool } from "pg";
import { makeSchema } from "postgraphile";
import { makePgService } from "postgraphile/adaptors/pg";
import { grafast } from "postgraphile/grafast";

import basePreset from "../graphile.config.js";

const queries: string[] = [];
let pool: Pool | undefined;

afterEach(() => {
  if (pool) {
    pool.end();
    pool = undefined;
  }
  queries.length = 0;
});

export async function getSchema() {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ?? "postgres:///graphile_aggregates_test",
    });
    pool.on("error", () => {});
    pool.on("connect", (client) => {
      // Ensure deterministic timestamp handling across environments.
      client.query(`set time zone 'UTC'`);
      client.on("error", () => {});
      const oldQuery = client.query;
      client.query = function (...args: any) {
        if (typeof args[0] === "object" && args[0] !== null) {
          const { text } = args[0];
          queries.push(text);
        } else {
          queries.push("/* UNSUPPORTED QUERY CALL! */");
        }
        return oldQuery.apply(this, args) as any;
      };
    });
  }

  const preset: GraphileConfig.Preset = {
    extends: [basePreset],
    disablePlugins: ["MutationPlugin"],
    pgServices: [
      makePgService({
        pool,
        schemas: ["test"],
      }),
    ],
  };
  return await makeSchema(preset);
}

export function testGraphQL(
  source: string,
  variableValues?: Record<string, any>
) {
  return async function () {
    const { schema, resolvedPreset } = await getSchema();
    queries.length = 0;
    const result = await grafast({
      schema,
      source,
      variableValues,
      resolvedPreset,
      requestContext: {},
    });
    if ("next" in result) {
      throw new Error(`Don't support iterable result`);
    }

    const { data, errors } = result;
    if (errors) {
      expect(errors).toMatchSnapshot("errors");
    }
    expect(data).toMatchSnapshot("result");
    expect(queries).toMatchSnapshot("sql");
    // TODO: plan?

    return result;
  };
}

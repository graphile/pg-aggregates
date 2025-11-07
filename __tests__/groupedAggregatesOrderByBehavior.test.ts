import type { GraphQLEnumType } from "graphql";
import { Pool } from "pg";
import { makeSchema } from "postgraphile";
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";

import { PgAggregatesPreset } from "../dist/index.js";

let pool: Pool | undefined;

afterEach(() => {
  if (pool) {
    pool.end();
    pool = undefined;
  }
});

async function getSchemaWithBehavior(behaviorConfig?: string) {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ?? "postgres:///graphile_aggregates_test",
    });
    pool.on("error", () => {});
    pool.on("connect", (client) => {
      client.query(`set time zone 'UTC'`);
      client.on("error", () => {});
    });
  }

  const preset: GraphileConfig.Preset = {
    extends: [
      PostGraphileAmberPreset,
      PostGraphileConnectionFilterPreset,
      PgAggregatesPreset,
    ],
    disablePlugins: ["MutationPlugin", "PgIndexBehaviorsPlugin"],
    pgServices: [
      makePgService({
        pool,
        schemas: ["test"],
      }),
    ],
    schema: behaviorConfig
      ? {
          defaultBehavior: behaviorConfig,
        }
      : undefined,
  };
  return await makeSchema(preset);
}

describe("GroupedAggregates OrderBy Behavior", () => {
  it("should support opt-out via explicit negative behavior", async () => {
    const { schema } = await getSchemaWithBehavior(
      "-resource:groupedAggregates:orderBy -attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    // When explicitly disabled, enum should have no values or not exist
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      expect(values.length).toBe(0);
    }
  });

  it("should include orderBy enum values with resource-level opt-in", async () => {
    const { schema } = await getSchemaWithBehavior(
      "+resource:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType;

    expect(matchStatOrderByType).toBeDefined();
    const values = matchStatOrderByType.getValues();

    // Should have orderBy options for all aggregates on all suitable attributes
    expect(values.length).toBeGreaterThan(0);

    // Check for specific values we expect
    const valueNames = values.map((v) => v.name);
    expect(valueNames).toContain("SUM_POINTS_ASC");
    expect(valueNames).toContain("SUM_POINTS_DESC");
    expect(valueNames).toContain("AVERAGE_GOALS_ASC");
    expect(valueNames).toContain("MAX_SAVES_DESC");
  });

  it("should include orderBy enum values with attribute-level opt-in", async () => {
    const { schema } = await getSchemaWithBehavior(
      "+attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    // When attribute-level behavior is enabled, enum should exist with values
    expect(matchStatOrderByType).toBeDefined();
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      expect(values.length).toBeGreaterThan(0);

      const valueNames = values.map((v) => v.name);
      expect(valueNames).toContain("SUM_POINTS_ASC");
      expect(valueNames).toContain("AVERAGE_POINTS_DESC");
    }
  });

  it("should support per-aggregate opt-in (sum only)", async () => {
    const { schema } = await getSchemaWithBehavior(
      "-attribute:aggregate:groupedAggregates:orderBy +sum:attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    expect(matchStatOrderByType).toBeDefined();
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      const valueNames = values.map((v) => v.name);

      // Should have SUM values
      expect(valueNames).toContain("SUM_POINTS_ASC");
      expect(valueNames).toContain("SUM_POINTS_DESC");
      expect(valueNames).toContain("SUM_GOALS_ASC");

      // Should NOT have AVERAGE, MIN, MAX, etc.
      expect(valueNames).not.toContain("AVERAGE_POINTS_ASC");
      expect(valueNames).not.toContain("MIN_POINTS_ASC");
      expect(valueNames).not.toContain("MAX_POINTS_ASC");
    }
  });

  it("should support multiple per-aggregate opt-ins (sum and average)", async () => {
    const { schema } = await getSchemaWithBehavior(
      "-attribute:aggregate:groupedAggregates:orderBy +sum:attribute:aggregate:groupedAggregates:orderBy +average:attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    expect(matchStatOrderByType).toBeDefined();
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      const valueNames = values.map((v) => v.name);

      // Should have SUM values
      expect(valueNames).toContain("SUM_POINTS_ASC");
      expect(valueNames).toContain("SUM_GOALS_DESC");

      // Should have AVERAGE values
      expect(valueNames).toContain("AVERAGE_POINTS_ASC");
      expect(valueNames).toContain("AVERAGE_GOALS_DESC");

      // Should NOT have MIN, MAX, etc.
      expect(valueNames).not.toContain("MIN_POINTS_ASC");
      expect(valueNames).not.toContain("MAX_POINTS_ASC");
      expect(valueNames).not.toContain("STDDEV_SAMPLE_POINTS_ASC");
    }
  });
});

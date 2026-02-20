import type {
  PgCodecRelation,
  PgCodecWithAttributes,
  PgResource,
  PgSelectQueryBuilder,
} from "@dataplan/pg";
import type { GraphQLEnumValueConfigMap } from "graphql";
import type { SQL } from "pg-sql2";

import type { AggregateSpec } from "./interfaces.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface Build {
      pgAggregatesOrderByAggregatesTotalCountApply: (
        table: PgResource,
        relation: PgCodecRelation,
        direction: "ASC" | "DESC",
        $select: PgSelectQueryBuilder
      ) => void;
      pgAggregatesOrderByAggregatesAttributeApply: (
        table: PgResource,
        relation: PgCodecRelation,
        aggregateSpec: AggregateSpec,
        attributeName: string,
        direction: "ASC" | "DESC",
        $select: PgSelectQueryBuilder
      ) => void;
    }
    interface BehaviorStrings {
      "relatedAggregates:orderBy": true;
      "resource:relatedAggregates:orderBy": true;
      "aggregates:orderBy": true;
      "manyRelation:aggregates:orderBy": true;
      "aggregate:orderBy": true;
      "attribute:aggregate:orderBy": true;

      "sum:manyRelation:aggregates:orderBy": true;
      "distinctCount:manyRelation:aggregates:orderBy": true;
      "min:manyRelation:aggregates:orderBy": true;
      "max:manyRelation:aggregates:orderBy": true;
      "average:manyRelation:aggregates:orderBy": true;
      "stddevSample:manyRelation:aggregates:orderBy": true;
      "stddevPopulation:manyRelation:aggregates:orderBy": true;
      "varianceSample:manyRelation:aggregates:orderBy": true;
      "variancePopulation:manyRelation:aggregates:orderBy": true;

      "sum:attribute:aggregate:orderBy": true;
      "distinctCount:attribute:aggregate:orderBy": true;
      "min:attribute:aggregate:orderBy": true;
      "max:attribute:aggregate:orderBy": true;
      "average:attribute:aggregate:orderBy": true;
      "stddevSample:attribute:aggregate:orderBy": true;
      "stddevPopulation:attribute:aggregate:orderBy": true;
      "varianceSample:attribute:aggregate:orderBy": true;
      "variancePopulation:attribute:aggregate:orderBy": true;
    }
  }
}

export const PgAggregatesOrderByAggregatesPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesOrderByAggregatesPlugin",
  description:
    "Adds enum values to the OrderBy enum to allow ordering by aggregates on relations.",
  version,
  provides: ["aggregates"],

  schema: {
    behaviorRegistry: {
      add: {
        "relatedAggregates:orderBy": {
          description: "",
          entities: ["pgResource"],
        },
        "aggregates:orderBy": {
          description: "",
          entities: ["pgCodecRelation"],
        },
        "aggregate:orderBy": {
          description: "",
          entities: ["pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      pgResource: "resource:relatedAggregates:orderBy",
      pgCodecRelation: ["select", "manyRelation:aggregates:orderBy"],
      pgCodecAttribute: ["attribute:aggregate:orderBy"],
    },

    hooks: {
      build(build) {
        const { EXPORTABLE, sql, dataplanPg } = build;
        if (!sql) {
          throw new Error(
            `PgAggregatesOrderByAggregatesPlugin must be loaded after build.sql is established`
          );
        }
        if (!dataplanPg) {
          throw new Error(
            `PgAggregatesOrderByAggregatesPlugin must be loaded after build.dataplanPg is established`
          );
        }
        const TYPES = dataplanPg?.TYPES;
        return build.extend(
          build,
          {
            pgAggregatesOrderByAggregatesTotalCountApply: EXPORTABLE(
              (TYPES, sql) => (table, relation, direction, $select) => {
                const foreignTableAlias = $select.alias;
                const conditions: SQL[] = [];
                const tableAlias = sql.identifier(Symbol(table.name));
                (relation.localAttributes as string[]).forEach(
                  (localAttribute, i) => {
                    const remoteAttribute = relation.remoteAttributes[
                      i
                    ] as string;
                    conditions.push(
                      sql.fragment`${tableAlias}.${sql.identifier(
                        remoteAttribute
                      )} = ${foreignTableAlias}.${sql.identifier(
                        localAttribute
                      )}`
                    );
                  }
                );
                if (typeof table.from === "function") {
                  throw new Error(`Function source unsupported`);
                }
                // TODO: refactor this to use joins instead of subqueries
                const fragment = sql`(${sql.indent`select count(*)
from ${table.from} ${tableAlias}
where ${sql.parens(
                  sql.join(
                    conditions.map((c) => sql.parens(c)),
                    " AND "
                  )
                )}`})`;
                $select.orderBy({
                  fragment,
                  codec: TYPES.bigint,
                  direction,
                });
              },
              [TYPES, sql],
              "pgAggregatesOrderByAggregatesTotalCountApply"
            ),
            pgAggregatesOrderByAggregatesAttributeApply: EXPORTABLE(
              (sql) =>
                (
                  table,
                  relation,
                  aggregateSpec,
                  attributeName,
                  direction,
                  $select
                ) => {
                  const attribute = table.codec.attributes![attributeName];
                  const foreignTableAlias = $select.alias;
                  const conditions: SQL[] = [];
                  const tableAlias = sql.identifier(Symbol(table.name));
                  (relation.localAttributes as string[]).forEach(
                    (localAttribute, i) => {
                      const remoteAttribute = relation.remoteAttributes[
                        i
                      ] as string;
                      conditions.push(
                        sql.fragment`${tableAlias}.${sql.identifier(
                          remoteAttribute
                        )} = ${foreignTableAlias}.${sql.identifier(
                          localAttribute
                        )}`
                      );
                    }
                  );
                  if (typeof table.from === "function") {
                    throw new Error(`Function source unsupported`);
                  }
                  // TODO: refactor this to use joins instead of subqueries
                  const fragment = sql`(${sql.indent`
select ${aggregateSpec.sqlAggregateWrap(
                    sql.fragment`${tableAlias}.${sql.identifier(
                      attributeName
                    )}`,
                    attribute.codec
                  )}
from ${table.from} ${tableAlias}
where ${sql.join(
                    conditions.map((c) => sql.parens(c)),
                    " AND "
                  )}`})`;
                  $select.orderBy({
                    fragment,
                    codec:
                      aggregateSpec.pgTypeCodecModifier?.(attribute.codec) ??
                      attribute.codec,
                    direction,
                  });
                },
              [sql],
              "pgAggregatesOrderByAggregatesAttributeApply"
            ),
          },
          "Adding helpers for PgAggregatesOrderByAggregatesPlugin"
        );
      },
      GraphQLEnumType_values(values, build, context) {
        const {
          extend,
          inflection,
          EXPORTABLE,
          pgAggregatesOrderByAggregatesTotalCountApply,
          pgAggregatesOrderByAggregatesAttributeApply,
        } = build;
        const pgAggregateSpecs: AggregateSpec[] = build.pgAggregateSpecs;
        const {
          scope: { isPgRowSortEnum, pgTypeResource, pgCodec },
        } = context;

        const foreignTable =
          pgTypeResource ??
          Object.values(build.input.pgRegistry.pgResources).find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        if (
          !isPgRowSortEnum ||
          !foreignTable ||
          foreignTable.parameters ||
          !foreignTable.codec.attributes
        ) {
          return values;
        }
        if (
          !build.behavior.pgResourceMatches(
            foreignTable,
            "resource:relatedAggregates:orderBy"
          )
        ) {
          return values;
        }

        const relations = foreignTable.getRelations() as {
          [relName: string]: PgCodecRelation<any, any>;
        };
        const referenceeRelations = Object.entries(relations).filter(
          ([_, rel]) => rel.isReferencee
        );

        const newValues = referenceeRelations.reduce(
          (memo, [relationName, relation]) => {
            if (!build.behavior.pgCodecRelationMatches(relation, "select")) {
              return memo;
            }
            if (
              !build.behavior.pgCodecRelationMatches(
                relation,
                "manyRelation:aggregates:orderBy"
              )
            ) {
              return memo;
            }
            const table = relation.remoteResource as PgResource<
              string,
              PgCodecWithAttributes
            >;
            const isUnique = !!relation.isUnique;
            if (isUnique) {
              // No point aggregating over a relation that's unique
              return memo;
            }

            // Add count
            const totalCountBaseName =
              inflection.orderByCountOfManyRelationByKeys({
                registry: foreignTable.registry,
                codec: foreignTable.codec,
                relationName,
              });

            const makeTotalCountApply = (direction: "ASC" | "DESC") => {
              return EXPORTABLE(
                (
                  direction,
                  pgAggregatesOrderByAggregatesTotalCountApply,
                  relation,
                  table
                ) =>
                  function apply($select: PgSelectQueryBuilder) {
                    pgAggregatesOrderByAggregatesTotalCountApply(
                      table,
                      relation,
                      direction,
                      $select
                    );
                  },
                [
                  direction,
                  pgAggregatesOrderByAggregatesTotalCountApply,
                  relation,
                  table,
                ]
              );
            };

            memo = build.extend(
              memo,
              {
                [`${totalCountBaseName}_ASC`]: {
                  extensions: {
                    grafast: {
                      apply: makeTotalCountApply("ASC"),
                    },
                  },
                },
                [`${totalCountBaseName}_DESC`]: {
                  extensions: {
                    grafast: {
                      apply: makeTotalCountApply("DESC"),
                    },
                  },
                },
              },
              `Adding orderBy count to '${foreignTable.name}' using relation '${relationName}'`
            );

            // Add other aggregates
            pgAggregateSpecs.forEach((aggregateSpec) => {
              if (
                !build.behavior.pgCodecRelationMatches(
                  relation,
                  `${aggregateSpec.id}:manyRelation:aggregates:orderBy`
                )
              ) {
                return;
              }
              for (const [attributeName, attribute] of Object.entries(
                table.codec.attributes
              )) {
                if (
                  !build.behavior.pgCodecAttributeMatches(
                    [table.codec, attributeName],
                    `${aggregateSpec.id}:attribute:aggregate:orderBy`
                  )
                ) {
                  continue;
                }
                if (
                  (aggregateSpec.shouldApplyToEntity &&
                    !aggregateSpec.shouldApplyToEntity({
                      type: "attribute",
                      codec: table.codec,
                      attributeName: attributeName,
                    })) ||
                  !aggregateSpec.isSuitableType(attribute.codec)
                ) {
                  continue;
                }
                const baseName =
                  inflection.orderByAttributeAggregateOfManyRelationByKeys({
                    registry: foreignTable.registry,
                    codec: foreignTable.codec,
                    relationName,
                    attributeName: attributeName,
                    aggregateSpec,
                  });

                const makeApply = (direction: "ASC" | "DESC") => {
                  return EXPORTABLE(
                    (
                      aggregateSpec,
                      attributeName,
                      direction,
                      pgAggregatesOrderByAggregatesAttributeApply,
                      relation,
                      table
                    ) =>
                      function apply($select: PgSelectQueryBuilder) {
                        pgAggregatesOrderByAggregatesAttributeApply(
                          table,
                          relation,
                          aggregateSpec,
                          attributeName,
                          direction,
                          $select
                        );
                      },
                    [
                      aggregateSpec,
                      attributeName,
                      direction,
                      pgAggregatesOrderByAggregatesAttributeApply,
                      relation,
                      table,
                    ]
                  );
                };

                memo = build.extend(
                  memo,
                  {
                    [`${baseName}_ASC`]: {
                      extensions: {
                        grafast: {
                          apply: makeApply("ASC"),
                        },
                      },
                    },
                    [`${baseName}_DESC`]: {
                      extensions: {
                        grafast: {
                          apply: makeApply("DESC"),
                        },
                      },
                    },
                  },

                  `Adding orderBy ${aggregateSpec.id} of '${attributeName}' to '${foreignTable.name}' using constraint '${relationName}'`
                );
              }
            });

            return memo;
          },
          Object.create(null) as GraphQLEnumValueConfigMap
        );

        return extend(
          values,
          newValues,
          `Adding aggregate orders to '${foreignTable.name}'`
        );
      },
    },
  },
};

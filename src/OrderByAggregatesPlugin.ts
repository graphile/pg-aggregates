import type {
  PgCodecAttributes,
  PgCodecRelation,
  PgResource,
  PgSelectStep,
} from "@dataplan/pg";
import type { GraphQLEnumValueConfigMap } from "graphql";
import type { SQL } from "pg-sql2";

import type { AggregateSpec } from "./interfaces.js";

const { version } = require("../package.json");

export const PgAggregatesOrderByAggregatesPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesOrderByAggregatesPlugin",
  version,
  provides: ["aggregates"],

  schema: {
    entityBehavior: {
      pgCodecRelation: "select aggregates:orderBy",
    },

    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const {
          extend,
          sql,
          inflection,
          dataplanPg: { TYPES },
          EXPORTABLE,
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
                "aggregates:orderBy"
              )
            ) {
              return memo;
            }
            const table = relation.remoteResource as PgResource;
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

            const makeTotalCountApplyPlan = (direction: "ASC" | "DESC") => {
              return EXPORTABLE(
                (TYPES, direction, relation, sql, table) =>
                  function applyPlan($select: PgSelectStep<any>) {
                    const foreignTableAlias = $select.alias;
                    const conditions: SQL[] = [];
                    const tableAlias = sql.identifier(Symbol(table.name));
                    relation.localAttributes.forEach(
                      (localAttribute: string, i) => {
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
                [TYPES, direction, relation, sql, table]
              );
            };

            memo = build.extend(
              memo,
              {
                [`${totalCountBaseName}_ASC`]: {
                  extensions: {
                    grafast: {
                      applyPlan: makeTotalCountApplyPlan("ASC"),
                    },
                  },
                },
                [`${totalCountBaseName}_DESC`]: {
                  extensions: {
                    grafast: {
                      applyPlan: makeTotalCountApplyPlan("DESC"),
                    },
                  },
                },
              },
              `Adding orderBy count to '${foreignTable.name}' using relation '${relationName}'`
            );

            // Add other aggregates
            pgAggregateSpecs.forEach((aggregateSpec) => {
              for (const [attributeName, attribute] of Object.entries(
                table.codec.attributes as PgCodecAttributes
              )) {
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

                const makeApplyPlan = (direction: "ASC" | "DESC") => {
                  return EXPORTABLE(
                    (
                      aggregateSpec,
                      attribute,
                      attributeName,
                      direction,
                      relation,
                      sql,
                      table
                    ) =>
                      function applyPlan($select: PgSelectStep<any>) {
                        const foreignTableAlias = $select.alias;
                        const conditions: SQL[] = [];
                        const tableAlias = sql.identifier(Symbol(table.name));
                        relation.localAttributes.forEach(
                          (localAttribute: string, i) => {
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
                            aggregateSpec.pgTypeCodecModifier?.(
                              attribute.codec
                            ) ?? attribute.codec,
                          direction,
                        });
                      },
                    [
                      aggregateSpec,
                      attribute,
                      attributeName,
                      direction,
                      relation,
                      sql,
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
                          applyPlan: makeApplyPlan("ASC"),
                        },
                      },
                    },
                    [`${baseName}_DESC`]: {
                      extensions: {
                        grafast: {
                          applyPlan: makeApplyPlan("DESC"),
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

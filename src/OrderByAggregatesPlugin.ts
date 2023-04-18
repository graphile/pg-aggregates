import {
  PgSelectStep,
  PgCodecRelation,
  PgCodecAttributes,
  TYPES,
} from "@dataplan/pg";
import { GraphQLEnumValueConfigMap } from "graphql";
import { SQL } from "pg-sql2";
import { AggregateSpec } from "./interfaces";

const { version } = require("../package.json");

export const PgAggregatesOrderByAggregatesPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesOrderByAggregatesPlugin",
  version,
  provides: ["aggregates"],

  schema: {
    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const { extend, sql, inflection } = build;
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
            const behavior = build.pgGetBehavior([
              relation.extensions,
              relation.remoteResource.extensions,
            ]);
            if (!build.behavior.matches(behavior, "select", "select")) {
              return memo;
            }
            const table = relation.remoteResource;
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
              return function applyPlan($select: PgSelectStep<any>) {
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
                if (typeof table.source === "function") {
                  throw new Error(`Function source unsupported`);
                }
                // TODO: refactor this to use joins instead of subqueries
                const fragment = sql`(${sql.indent`select count(*)
from ${table.source} ${tableAlias}
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
              };
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
                const baseName =
                  inflection.orderByAttributeAggregateOfManyRelationByKeys({
                    registry: foreignTable.registry,
                    codec: foreignTable.codec,
                    relationName,
                    attributeName: attributeName,
                    aggregateSpec,
                  });

                const makeApplyPlan = (direction: "ASC" | "DESC") => {
                  return function applyPlan($select: PgSelectStep<any>) {
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
                    if (typeof table.source === "function") {
                      throw new Error(`Function source unsupported`);
                    }
                    // TODO: refactor this to use joins instead of subqueries
                    const fragment = sql`(${sql.indent`
select ${aggregateSpec.sqlAggregateWrap(
                      sql.fragment`${tableAlias}.${sql.identifier(
                        attributeName
                      )}`
                    )}
from ${table.source} ${tableAlias}
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
                  };
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

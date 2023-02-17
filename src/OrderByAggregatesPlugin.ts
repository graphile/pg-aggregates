import {
  PgOrderSpec,
  PgSelectStep,
  PgSourceBuilder,
  PgSourceRelation,
  PgTypeColumns,
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
          scope: { isPgRowSortEnum, pgTypeSource, pgCodec },
        } = context;

        const foreignTable =
          pgTypeSource ??
          build.input.pgSources.find(
            (s) => s.codec === pgCodec && !s.parameters
          );

        if (
          !isPgRowSortEnum ||
          !foreignTable ||
          foreignTable.parameters ||
          !foreignTable.codec.columns
        ) {
          return values;
        }

        const relations = foreignTable.getRelations() as {
          [relName: string]: PgSourceRelation<any, any>;
        };
        const referenceeRelations = Object.entries(relations).filter(
          ([_, rel]) => rel.isReferencee
        );

        const newValues = referenceeRelations.reduce(
          (memo, [relationName, relation]) => {
            const behavior = build.pgGetBehavior([
              relation.extensions,
              relation.source.extensions,
            ]);
            if (!build.behavior.matches(behavior, "select", "select")) {
              return memo;
            }
            const table =
              relation.source instanceof PgSourceBuilder
                ? relation.source.get()
                : relation.source;
            const isUnique = !!relation.isUnique;
            if (isUnique) {
              // No point aggregating over a relation that's unique
              return memo;
            }

            // Add count
            const totalCountBaseName =
              inflection.orderByCountOfManyRelationByKeys({
                source: foreignTable,
                relationName,
              });

            const makeTotalCountApplyPlan = (direction: "ASC" | "DESC") => {
              return function applyPlan(
                $select: PgSelectStep<any, any, any, any>
              ) {
                const foreignTableAlias = $select.alias;
                const conditions: SQL[] = [];
                const tableAlias = sql.identifier(Symbol(table.name));
                relation.localColumns.forEach((localColumn: string, i) => {
                  const remoteColumn = relation.remoteColumns[i] as string;
                  conditions.push(
                    sql.fragment`${tableAlias}.${sql.identifier(
                      remoteColumn
                    )} = ${foreignTableAlias}.${sql.identifier(localColumn)}`
                  );
                });
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
                  direction: "ASC",
                });
              };
            };

            memo = build.extend(
              memo,
              {
                [`${totalCountBaseName}_ASC`]: {
                  extensions: {
                    graphile: {
                      applyPlan: makeTotalCountApplyPlan("ASC"),
                    },
                  },
                },
                [`${totalCountBaseName}_DESC`]: {
                  extensions: {
                    graphile: {
                      applyPlan: makeTotalCountApplyPlan("DESC"),
                    },
                  },
                },
              },
              `Adding orderBy count to '${foreignTable.name}' using relation '${relationName}'`
            );

            // Add other aggregates
            pgAggregateSpecs.forEach((aggregateSpec) => {
              for (const [columnName, column] of Object.entries(
                table.codec.columns as PgTypeColumns
              )) {
                const baseName =
                  inflection.orderByColumnAggregateOfManyRelationByKeys({
                    source: foreignTable,
                    relationName,
                    columnName,
                    aggregateSpec,
                  });

                const makeApplyPlan = (direction: "ASC" | "DESC") => {
                  return function applyPlan(
                    $select: PgSelectStep<any, any, any, any>
                  ) {
                    const foreignTableAlias = $select.alias;
                    const conditions: SQL[] = [];
                    const tableAlias = sql.identifier(Symbol(table.name));
                    relation.localColumns.forEach((localColumn: string, i) => {
                      const remoteColumn = relation.remoteColumns[i] as string;
                      conditions.push(
                        sql.fragment`${tableAlias}.${sql.identifier(
                          remoteColumn
                        )} = ${foreignTableAlias}.${sql.identifier(
                          localColumn
                        )}`
                      );
                    });
                    if (typeof table.source === "function") {
                      throw new Error(`Function source unsupported`);
                    }
                    // TODO: refactor this to use joins instead of subqueries
                    const fragment = sql`(${sql.indent`
select ${aggregateSpec.sqlAggregateWrap(
                      sql.fragment`${tableAlias}.${sql.identifier(columnName)}`
                    )}
from ${table.source} ${tableAlias}
where ${sql.join(
                      conditions.map((c) => sql.parens(c)),
                      " AND "
                    )}`})`;
                    $select.orderBy({
                      fragment,
                      codec:
                        aggregateSpec.pgTypeCodecModifier?.(column.codec) ??
                        column.codec,
                      direction: "ASC",
                    });
                  };
                };

                memo = build.extend(
                  memo,
                  {
                    [`${baseName}_ASC`]: {
                      extensions: {
                        graphile: {
                          applyPlan: makeApplyPlan("ASC"),
                        },
                      },
                    },
                    [`${baseName}_DESC`]: {
                      extensions: {
                        graphile: {
                          applyPlan: makeApplyPlan("DESC"),
                        },
                      },
                    },
                  },

                  `Adding orderBy ${aggregateSpec.id} of '${columnName}' to '${foreignTable.name}' using constraint '${relationName}'`
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

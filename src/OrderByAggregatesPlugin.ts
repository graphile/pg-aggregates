import { PgSourceRelation } from "@dataplan/pg";
import { SQL } from "pg-sql2";
import { AggregateSpec } from "./interfaces";

const { version } = require("../package.json");

type OrderBySpecIdentity = string | SQL | ((options: {}) => SQL);

type OrderSpec =
  | [OrderBySpecIdentity, boolean]
  | [OrderBySpecIdentity, boolean, boolean];
export interface OrderSpecs {
  [orderByEnumValue: string]: {
    value: {
      alias?: string;
      specs: Array<OrderSpec>;
      unique: boolean;
    };
  };
}

export const PgAggregatesOrderByAggregatesPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesOrderByAggregatesPlugin",
  version,

  schema: {
    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const { extend, sql, inflection } = build;
        const pgAggregateSpecs: AggregateSpec[] = build.pgAggregateSpecs;
        const {
          scope: { isPgRowSortEnum, pgTypeSource: foreignTable },
        } = context;

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
            const table = relation.source;
            const isUnique = !!relation.isUnique;
            if (isUnique) {
              // No point aggregating over a relation that's unique
              return memo;
            }
            /*
            const tableAlias = sql.identifier(
              Symbol(`${foreignTable.namespaceName}.${foreignTable.name}`)
            );
            */

            // Add count
            memo = build.extend(
              memo,
              orderByAscDesc(
                inflection.orderByCountOfManyRelationByKeys({
                  source: foreignTable,
                  relationName,
                }),
                /*
                ({ queryBuilder }) => {
                  const foreignTableAlias = queryBuilder.getTableAlias();
                  const conditions: SQL[] = [];
                  keys.forEach((key, i) => {
                    conditions.push(
                      sql.fragment`${tableAlias}.${sql.identifier(
                        key.name
                      )} = ${foreignTableAlias}.${sql.identifier(
                        foreignKeys[i].name
                      )}`
                    );
                  });
                  return sql.fragment`(select count(*) from ${sql.identifier(
                    table.namespaceName,
                    table.name
                  )} ${tableAlias} where (${sql.join(conditions, " AND ")}))`;
                },
                */
                sql`(1 + 1) /* TODO */`,
                false
              ),
              `Adding orderBy count to '${foreignTable.name}' using relation '${relationName}'`
            );

            // Add other aggregates
            pgAggregateSpecs.forEach((aggregateSpec) => {
              for (const [columnName, column] of Object.entries(
                table.codec.columns
              )) {
                memo = build.extend(
                  memo,
                  orderByAscDesc(
                    inflection.orderByColumnAggregateOfManyRelationByKeys({
                      source: foreignTable,
                      relationName,
                      columnName,
                      aggregateSpec,
                    }),
                    /*
                    ({ queryBuilder }) => {
                      const foreignTableAlias = queryBuilder.getTableAlias();
                      const conditions: SQL[] = [];
                      keys.forEach((key, i) => {
                        conditions.push(
                          sql.fragment`${tableAlias}.${sql.identifier(
                            key.name
                          )} = ${foreignTableAlias}.${sql.identifier(
                            foreignKeys[i].name
                          )}`
                        );
                      });
                      return sql.fragment`(select ${aggregateSpec.sqlAggregateWrap(
                        sql.fragment`${tableAlias}.${sql.identifier(attr.name)}`
                      )} from ${sql.identifier(
                        table.namespaceName,
                        table.name
                      )} ${tableAlias} where (${sql.join(
                        conditions,
                        " AND "
                      )}))`;
                    },
                    */
                    sql`(1 + 1) /* TODO */`,
                    false
                  ),
                  `Adding orderBy ${aggregateSpec.id} of '${columnName}' to '${foreignTable.name}' using constraint '${relationName}'`
                );
              }
            });

            return memo;
          },
          {} as OrderSpecs
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

export function orderByAscDesc(
  baseName: string,
  columnOrSqlFragment: OrderBySpecIdentity,
  unique = false
): OrderSpecs {
  return {
    [`${baseName}_ASC`]: {
      value: {
        alias: `${baseName}_ASC`,
        specs: [[columnOrSqlFragment, true]],
        unique,
      },
    },
    [`${baseName}_DESC`]: {
      value: {
        alias: `${baseName}_DESC`,
        specs: [[columnOrSqlFragment, false]],
        unique,
      },
    },
  };
}

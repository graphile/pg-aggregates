import { PgSelectStep, PgSourceUnique, PgTypeColumn } from "@dataplan/pg";
import { GraphQLEnumValueConfig, GraphQLEnumValueConfigMap } from "graphql";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin",
  version,
  provides: ["aggregates"],

  // Now add group by columns
  schema: {
    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const { extend, inflection, sql, pgAggregateGroupBySpecs } = build;
        const {
          scope: { isPgAggregateGroupEnum, pgTypeSource: table },
        } = context;
        if (
          !isPgAggregateGroupEnum ||
          !table ||
          table.parameters ||
          !table.codec.columns
        ) {
          return values;
        }
        return extend(
          values,
          Object.entries(table.codec.columns).reduce(
            (memo, [columnName, column]: [string, PgTypeColumn]) => {
              const behavior = build.pgGetBehavior([column.extensions]);
              // Grouping requires ordering.
              if (!build.behavior.matches(behavior, "order", "order")) {
                return memo;
              }
              const unique = !!(table.uniques as PgSourceUnique[]).find(
                (u) => u.columns.length === 1 && u.columns[0] === columnName
              );
              if (unique) return memo; // No point grouping by something that's unique.

              const fieldName = inflection.aggregateGroupByColumnEnum({
                source: table,
                columnName,
              });
              memo = extend(
                memo,
                {
                  [fieldName]: {
                    extensions: {
                      graphile: {
                        applyPlan($pgSelect: PgSelectStep<any, any, any, any>) {
                          $pgSelect.groupBy({
                            fragment: sql.fragment`${
                              $pgSelect.alias
                            }.${sql.identifier(columnName)}`,
                          });
                        },
                      },
                    },
                  },
                },
                `Adding groupBy enum value for ${table.name}.${columnName}.`
              );

              pgAggregateGroupBySpecs.forEach((aggregateGroupBySpec) => {
                if (
                  (!aggregateGroupBySpec.shouldApplyToEntity ||
                    aggregateGroupBySpec.shouldApplyToEntity({
                      type: "column",
                      codec: table.codec,
                      columnName,
                    })) &&
                  aggregateGroupBySpec.isSuitableType(column.codec)
                ) {
                  const fieldName =
                    inflection.aggregateGroupByColumnDerivativeEnum({
                      source: table,
                      columnName,
                      aggregateGroupBySpec,
                    });
                  memo = extend(
                    memo,
                    {
                      [fieldName]: {
                        extensions: {
                          graphile: {
                            applyPlan(
                              $pgSelect: PgSelectStep<any, any, any, any>
                            ) {
                              $pgSelect.groupBy({
                                fragment: aggregateGroupBySpec.sqlWrap(
                                  sql`${$pgSelect.alias}.${sql.identifier(
                                    columnName
                                  )}`
                                ),
                              });
                            },
                          },
                        },
                      } as GraphQLEnumValueConfig,
                    },
                    `Adding groupBy enum value for '${aggregateGroupBySpec.id}' derivative of ${table.name}.${columnName}.`
                  );
                }
              });

              return memo;
            },
            Object.create(null) as GraphQLEnumValueConfigMap
          ),
          `Adding group by values for columns from table '${table.name}'`
        );
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin };

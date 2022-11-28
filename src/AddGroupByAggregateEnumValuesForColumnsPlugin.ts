import { PgSourceUnique, PgTypeColumn } from "@dataplan/pg";
import { AggregateGroupBySpec } from "./interfaces";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin",
  version,

  // Now add group by columns
  schema: {
    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const {
          extend,
          inflection,
          sqlCommentByAddingTags,
          sql,
          pgAggregateGroupBySpecs,
        } = build;
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
                    value: {
                      spec: (tableAlias: SQL) =>
                        sql.fragment`${tableAlias}.${sql.identifier(
                          attr.name
                        )}`,
                    },
                  },
                },
                `Adding groupBy enum value for ${describePgEntity(
                  attr
                )}. You can rename this field with a 'Smart Comment':\n\n  ${sqlCommentByAddingTags(
                  attr,
                  {
                    name: "newNameHere",
                  }
                )}`
              );

              pgAggregateGroupBySpecs.forEach((spec) => {
                if (
                  (!spec.shouldApplyToEntity ||
                    spec.shouldApplyToEntity(attr)) &&
                  spec.isSuitableType(attr.type)
                ) {
                  const fieldName =
                    inflection.aggregateGroupByColumnDerivativeEnum(attr, spec);
                  memo = extend(
                    memo,
                    {
                      [fieldName]: {
                        value: {
                          spec: (tableAlias: SQL) =>
                            spec.sqlWrap(
                              sql.fragment`${tableAlias}.${sql.identifier(
                                attr.name
                              )}`
                            ),
                        },
                      },
                    },
                    `Adding groupBy enum value for '${
                      spec.id
                    }' derivative of ${describePgEntity(
                      attr
                    )}. You can rename this field with a 'Smart Comment':\n\n  ${sqlCommentByAddingTags(
                      attr,
                      {
                        name: "newNameHere",
                      }
                    )}`
                  );
                }
              });

              return memo;
            },
            {}
          ),
          `Adding group by values for columns from table '${table.name}'`
        );
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumValuesForColumnsPlugin };

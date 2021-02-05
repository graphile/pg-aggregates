import type { Plugin } from "graphile-build";
import type { PgClass, SQL } from "graphile-build-pg";
import { AggregateGroupBySpec } from "./interfaces";

const AddGroupByAggregateEnumValuesForColumnsPlugin: Plugin = (builder) => {
  // Now add group by columns
  builder.hook(
    "GraphQLEnumType:values",
    (values, build, context) => {
      const {
        extend,
        pgColumnFilter,
        inflection,
        pgOmit: omit,
        describePgEntity,
        sqlCommentByAddingTags,
        pgSql: sql,
      } = build;
      const pgAggregateGroupBySpecs: AggregateGroupBySpec[] =
        build.pgAggregateGroupBySpecs;
      const {
        scope: { isPgAggregateGroupEnum, pgIntrospection },
      } = context;
      if (
        !isPgAggregateGroupEnum ||
        !pgIntrospection ||
        pgIntrospection.kind !== "class"
      ) {
        return values;
      }
      const table: PgClass = pgIntrospection;
      return extend(
        values,
        table.attributes.reduce((memo, attr) => {
          if (!pgColumnFilter(attr, build, context)) return memo;
          if (omit(attr, "order")) return memo; // Grouping requires ordering.
          const unique = attr.isUnique;
          if (unique) return memo; // No point grouping by something that's unique.

          const fieldName = inflection.aggregateGroupByColumnEnum(attr);
          memo = extend(
            memo,
            {
              [fieldName]: {
                value: {
                  spec: (tableAlias: SQL) =>
                    sql.fragment`${tableAlias}.${sql.identifier(attr.name)}`,
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
              (!spec.shouldApplyToEntity || spec.shouldApplyToEntity(attr)) &&
              spec.isSuitableType(attr.type)
            ) {
              const fieldName = inflection.aggregateGroupByColumnDerivativeEnum(
                attr,
                spec
              );
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
        }, {}),
        `Adding group by values for columns from table '${table.name}'`
      );
    },
    ["AddGroupByAggregateEnumValuesForColumnsPlugin"]
  );
};

export default AddGroupByAggregateEnumValuesForColumnsPlugin;

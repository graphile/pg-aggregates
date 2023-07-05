import type {
  PgSelectStep,
  PgResourceUnique,
  PgCodecAttribute,
} from "@dataplan/pg";
import type {
  GraphQLEnumValueConfig,
  GraphQLEnumValueConfigMap,
} from "graphql";

const { version } = require("../package.json");

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin",
  version,
  provides: ["aggregates"],

  // Now add group by attributes
  schema: {
    entityBehavior: {
      pgCodecAttribute: "order",
    },
    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const { extend, inflection, sql, pgAggregateGroupBySpecs } = build;
        const {
          scope: { isPgAggregateGroupEnum, pgTypeResource: table },
        } = context;
        if (
          !isPgAggregateGroupEnum ||
          !table ||
          table.parameters ||
          !table.codec.attributes
        ) {
          return values;
        }
        return extend(
          values,
          Object.entries(table.codec.attributes).reduce(
            (memo, [attributeName, attribute]: [string, PgCodecAttribute]) => {
              // Grouping requires ordering.
              if (
                !build.behavior.pgCodecAttributeMatches(
                  [table.codec, attribute],
                  "order"
                )
              ) {
                return memo;
              }
              const unique = !!(table.uniques as PgResourceUnique[]).find(
                (u) =>
                  u.attributes.length === 1 && u.attributes[0] === attributeName
              );
              if (unique) return memo; // No point grouping by something that's unique.

              const fieldName = inflection.aggregateGroupByAttributeEnum({
                resource: table,
                attributeName,
              });
              memo = extend(
                memo,
                {
                  [fieldName]: {
                    extensions: {
                      grafast: {
                        applyPlan($pgSelect: PgSelectStep<any>) {
                          $pgSelect.groupBy({
                            fragment: sql.fragment`${
                              $pgSelect.alias
                            }.${sql.identifier(attributeName)}`,
                          });
                        },
                      },
                    },
                  },
                },
                `Adding groupBy enum value for ${table.name}.${attributeName}.`
              );

              pgAggregateGroupBySpecs.forEach((aggregateGroupBySpec) => {
                if (
                  (!aggregateGroupBySpec.shouldApplyToEntity ||
                    aggregateGroupBySpec.shouldApplyToEntity({
                      type: "attribute",
                      codec: table.codec,
                      attributeName,
                    })) &&
                  aggregateGroupBySpec.isSuitableType(attribute.codec)
                ) {
                  const fieldName =
                    inflection.aggregateGroupByAttributeDerivativeEnum({
                      resource: table,
                      attributeName,
                      aggregateGroupBySpec,
                    });
                  memo = extend(
                    memo,
                    {
                      [fieldName]: {
                        extensions: {
                          grafast: {
                            applyPlan($pgSelect: PgSelectStep<any>) {
                              $pgSelect.groupBy({
                                fragment: aggregateGroupBySpec.sqlWrap(
                                  sql`${$pgSelect.alias}.${sql.identifier(
                                    attributeName
                                  )}`
                                ),
                              });
                            },
                          },
                        },
                      } as GraphQLEnumValueConfig,
                    },
                    `Adding groupBy enum value for '${aggregateGroupBySpec.id}' derivative of ${table.name}.${attributeName}.`
                  );
                }
              });

              return memo;
            },
            Object.create(null) as GraphQLEnumValueConfigMap
          ),
          `Adding group by values for attributes from table '${table.name}'`
        );
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin };

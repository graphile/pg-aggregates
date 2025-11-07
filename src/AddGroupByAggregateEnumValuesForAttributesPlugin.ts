import type {
  PgCodecAttribute,
  PgResourceUnique,
  PgSelectQueryBuilder,
} from "@dataplan/pg";
import type {
  GraphQLEnumValueConfig,
  GraphQLEnumValueConfigMap,
} from "graphql";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "attribute:groupBy": true;
      groupBy: true;
    }
  }
}

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin",
  description:
    "Adds values representing table attributes to the enum that defines the groupedAggregates groupings.",
  version,
  provides: ["aggregates"],

  // Now add group by attributes
  schema: {
    behaviorRegistry: {
      add: {
        "attribute:groupBy": {
          description: "Can we group by this attribute when aggregating?",
          entities: ["pgCodecAttribute"],
        },
        groupBy: {
          description: "Can we group by this attribute when aggregating?",
          entities: ["pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      pgCodecAttribute: ["attribute:groupBy"],
    },

    hooks: {
      GraphQLEnumType_values(values, build, context) {
        const { extend, inflection, sql, pgAggregateGroupBySpecs, EXPORTABLE } =
          build;
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
          (
            Object.entries(table.codec.attributes) as [
              string,
              PgCodecAttribute
            ][]
          ).reduce((memo, [attributeName, attribute]) => {
            // Grouping requires ordering.
            if (
              !build.behavior.pgCodecAttributeMatches(
                [table.codec, attributeName],
                "orderBy"
              )
            ) {
              return memo;
            }
            if (
              !build.behavior.pgCodecAttributeMatches(
                [table.codec, attributeName],
                `attribute:groupBy`
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
            const attrCodec = attribute.codec;
            memo = extend(
              memo,
              {
                [fieldName]: {
                  extensions: {
                    grafast: {
                      apply: EXPORTABLE(
                        (attrCodec, attributeName, sql) =>
                          function ($pgSelect: PgSelectQueryBuilder) {
                            const fragment = sql.fragment`${
                              $pgSelect.alias
                            }.${sql.identifier(attributeName)}`;
                            $pgSelect.groupBy({
                              fragment,
                              codec: attrCodec,
                            });
                            // Default ordering by GROUP BY columns for deterministic results
                            $pgSelect.orderBy({
                              fragment,
                              codec: attrCodec,
                              direction: "ASC",
                            });
                          },
                        [attrCodec, attributeName, sql]
                      ),
                    },
                  },
                },
              },
              `Adding groupBy enum value for ${table.name}.${attributeName}.`
            );

            // Derivatives of this attribute
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
                          apply: EXPORTABLE(
                            (
                              aggregateGroupBySpec,
                              attrCodec,
                              attributeName,
                              sql
                            ) =>
                              function ($pgSelect: PgSelectQueryBuilder) {
                                const fragment = aggregateGroupBySpec.sqlWrap(
                                  sql`${$pgSelect.alias}.${sql.identifier(
                                    attributeName
                                  )}`
                                );
                                const codec =
                                  aggregateGroupBySpec.sqlWrapCodec(attrCodec);
                                $pgSelect.groupBy({
                                  fragment,
                                  codec,
                                });
                                // Default ordering by GROUP BY columns for deterministic results
                                $pgSelect.orderBy({
                                  fragment,
                                  codec,
                                  direction: "ASC",
                                });
                              },
                            [
                              aggregateGroupBySpec,
                              attrCodec,
                              attributeName,
                              sql,
                            ]
                          ),
                        },
                      },
                    } as GraphQLEnumValueConfig,
                  },
                  `Adding groupBy enum value for '${aggregateGroupBySpec.id}' derivative of ${table.name}.${attributeName}.`
                );
              }
            });

            return memo;
          }, Object.create(null) as GraphQLEnumValueConfigMap),
          `Adding group by values for attributes from table '${table.name}'`
        );
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupByAggregateEnumValuesForAttributesPlugin };

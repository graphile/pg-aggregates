import type {
  PgCodec,
  PgCodecAttribute,
  PgResourceUnique,
  PgSelectQueryBuilder,
} from "@dataplan/pg";
import type { PgSQL } from "graphile-build-pg/pg-sql2";
import type {
  GraphQLEnumValueConfig,
  GraphQLEnumValueConfigMap,
} from "graphql";

import type { AggregateGroupBySpec } from ".";
import { EXPORTABLE } from "./EXPORTABLE";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "attribute:groupBy": true;
      groupBy: true;
    }
  }
}

const applyGroupByAggregateSpec = EXPORTABLE(
  () =>
    (
      sql: PgSQL,
      aggregateGroupBySpec: AggregateGroupBySpec,
      attributeName: string,
      attrCodec: PgCodec,
      qb: PgSelectQueryBuilder
    ) => {
      qb.groupBy({
        fragment: aggregateGroupBySpec.sqlWrap(
          sql`${qb.alias}.${sql.identifier(attributeName)}`
        ),
        codec: aggregateGroupBySpec.sqlWrapCodec(attrCodec),
      });
    },
  [],
  "applyGroupByAggregateSpec"
);

const applyGroupByAttribute = EXPORTABLE(
  () =>
    (
      sql: PgSQL,
      attributeName: string,
      attrCodec: PgCodec,
      qb: PgSelectQueryBuilder
    ) => {
      qb.groupBy({
        fragment: sql.fragment`${qb.alias}.${sql.identifier(attributeName)}`,
        codec: attrCodec,
      });
    },
  [],
  "applyGroupByAttribute"
);

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
                        (
                          applyGroupByAttribute,
                          attrCodec,
                          attributeName,
                          sql
                        ) =>
                          function ($pgSelect: PgSelectQueryBuilder) {
                            applyGroupByAttribute(
                              sql,
                              attributeName,
                              attrCodec,
                              $pgSelect
                            );
                          },
                        [applyGroupByAttribute, attrCodec, attributeName, sql]
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
                              applyGroupByAggregateSpec,
                              attrCodec,
                              attributeName,
                              sql
                            ) =>
                              function (qb: PgSelectQueryBuilder) {
                                applyGroupByAggregateSpec(
                                  sql,
                                  aggregateGroupBySpec,
                                  attributeName,
                                  attrCodec,
                                  qb
                                );
                              },
                            [
                              aggregateGroupBySpec,
                              applyGroupByAggregateSpec,
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

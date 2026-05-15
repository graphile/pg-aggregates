import type {
  PgCodecAttribute,
  PgCodecRelation,
  PgCodecWithAttributes,
  PgResource,
  PgSelectQueryBuilder,
  sql,
} from "@dataplan/pg";
import type { GraphQLEnumValueConfigMap } from "graphql";

import { EXPORTABLE } from "./EXPORTABLE.js";
import type { AggregateSpec } from "./interfaces.js";

type SQL = ReturnType<typeof sql>;

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "relatedAggregates:orderBy": true;
      "resource:relatedAggregates:orderBy": true;
      "aggregates:orderBy": true;
      "manyRelation:aggregates:orderBy": true;
      "aggregate:orderBy": true;
      "attribute:aggregate:orderBy": true;

      "sum:manyRelation:aggregates:orderBy": true;
      "distinctCount:manyRelation:aggregates:orderBy": true;
      "min:manyRelation:aggregates:orderBy": true;
      "max:manyRelation:aggregates:orderBy": true;
      "average:manyRelation:aggregates:orderBy": true;
      "stddevSample:manyRelation:aggregates:orderBy": true;
      "stddevPopulation:manyRelation:aggregates:orderBy": true;
      "varianceSample:manyRelation:aggregates:orderBy": true;
      "variancePopulation:manyRelation:aggregates:orderBy": true;

      "sum:attribute:aggregate:orderBy": true;
      "distinctCount:attribute:aggregate:orderBy": true;
      "min:attribute:aggregate:orderBy": true;
      "max:attribute:aggregate:orderBy": true;
      "average:attribute:aggregate:orderBy": true;
      "stddevSample:attribute:aggregate:orderBy": true;
      "stddevPopulation:attribute:aggregate:orderBy": true;
      "varianceSample:attribute:aggregate:orderBy": true;
      "variancePopulation:attribute:aggregate:orderBy": true;
    }
  }
}

const pgAggregatesApplyOrderByTotalCount = EXPORTABLE(
  () =>
    (
      TYPES: GraphileBuild.Build["dataplanPg"]["TYPES"],
      direction: "ASC" | "DESC",
      relation: PgCodecRelation,
      sql: GraphileBuild.Build["sql"],
      table: PgResource,
      $select: PgSelectQueryBuilder
    ) => {
      const foreignTableAlias = $select.alias;
      const conditions: SQL[] = [];
      const tableAlias = sql.identifier(Symbol(table.name));
      (relation.localAttributes as string[]).forEach((localAttribute, i) => {
        const remoteAttribute = relation.remoteAttributes[i] as string;
        conditions.push(
          sql.fragment`${tableAlias}.${sql.identifier(
            remoteAttribute
          )} = ${foreignTableAlias}.${sql.identifier(localAttribute)}`
        );
      });
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
  [],
  "pgAggregatesApplyOrderByTotalCount"
);

const pgAggregatesApplyOrderByAttribute = EXPORTABLE(
  () =>
    (
      aggregateSpec: AggregateSpec,
      attribute: PgCodecAttribute,
      attributeName: string,
      direction: "ASC" | "DESC",
      relation: PgCodecRelation,
      sql: GraphileBuild.Build["sql"],
      table: PgResource,
      $select: PgSelectQueryBuilder
    ) => {
      const foreignTableAlias = $select.alias;
      const conditions: SQL[] = [];
      const tableAlias = sql.identifier(Symbol(table.name));
      (relation.localAttributes as string[]).forEach((localAttribute, i) => {
        const remoteAttribute = relation.remoteAttributes[i] as string;
        conditions.push(
          sql.fragment`${tableAlias}.${sql.identifier(
            remoteAttribute
          )} = ${foreignTableAlias}.${sql.identifier(localAttribute)}`
        );
      });
      if (typeof table.from === "function") {
        throw new Error(`Function source unsupported`);
      }
      // TODO: refactor this to use joins instead of subqueries
      const fragment = sql`(${sql.indent`
select ${aggregateSpec.sqlAggregateWrap(
        sql.fragment`${tableAlias}.${sql.identifier(attributeName)}`,
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
          aggregateSpec.pgTypeCodecModifier?.(attribute.codec) ??
          attribute.codec,
        direction,
      });
    },
  [],
  "pgAggregatesApplyOrderByAttribute"
);

export const PgAggregatesOrderByAggregatesPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesOrderByAggregatesPlugin",
  description:
    "Adds enum values to the OrderBy enum to allow ordering by aggregates on relations.",
  version,
  provides: ["aggregates"],

  schema: {
    behaviorRegistry: {
      add: {
        "relatedAggregates:orderBy": {
          description: "",
          entities: ["pgResource"],
        },
        "aggregates:orderBy": {
          description: "",
          entities: ["pgCodecRelation"],
        },
        "aggregate:orderBy": {
          description: "",
          entities: ["pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      pgResource: "resource:relatedAggregates:orderBy",
      pgCodecRelation: ["select", "manyRelation:aggregates:orderBy"],
      pgCodecAttribute: ["attribute:aggregate:orderBy"],
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
        if (
          !build.behavior.pgResourceMatches(
            foreignTable,
            "resource:relatedAggregates:orderBy"
          )
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
                "manyRelation:aggregates:orderBy"
              )
            ) {
              return memo;
            }
            const table = relation.remoteResource as PgResource<
              string,
              PgCodecWithAttributes
            >;
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

            const makeTotalCountApply = (direction: "ASC" | "DESC") => {
              return EXPORTABLE(
                (
                  TYPES,
                  direction,
                  pgAggregatesApplyOrderByTotalCount,
                  relation,
                  sql,
                  table
                ) =>
                  function apply($select: PgSelectQueryBuilder) {
                    pgAggregatesApplyOrderByTotalCount(
                      TYPES,
                      direction,
                      relation,
                      sql,
                      table,
                      $select
                    );
                  },
                [
                  TYPES,
                  direction,
                  pgAggregatesApplyOrderByTotalCount,
                  relation,
                  sql,
                  table,
                ]
              );
            };

            memo = build.extend(
              memo,
              {
                [`${totalCountBaseName}_ASC`]: {
                  extensions: {
                    grafast: {
                      apply: makeTotalCountApply("ASC"),
                    },
                  },
                },
                [`${totalCountBaseName}_DESC`]: {
                  extensions: {
                    grafast: {
                      apply: makeTotalCountApply("DESC"),
                    },
                  },
                },
              },
              `Adding orderBy count to '${foreignTable.name}' using relation '${relationName}'`
            );

            // Add other aggregates
            pgAggregateSpecs.forEach((aggregateSpec) => {
              if (
                !build.behavior.pgCodecRelationMatches(
                  relation,
                  `${aggregateSpec.id}:manyRelation:aggregates:orderBy`
                )
              ) {
                return;
              }
              for (const [attributeName, attribute] of Object.entries(
                table.codec.attributes
              )) {
                if (
                  !build.behavior.pgCodecAttributeMatches(
                    [table.codec, attributeName],
                    `${aggregateSpec.id}:attribute:aggregate:orderBy`
                  )
                ) {
                  continue;
                }
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

                const makeApply = (direction: "ASC" | "DESC") => {
                  return EXPORTABLE(
                    (
                      aggregateSpec,
                      attribute,
                      attributeName,
                      direction,
                      pgAggregatesApplyOrderByAttribute,
                      relation,
                      sql,
                      table
                    ) =>
                      function apply($select: PgSelectQueryBuilder) {
                        pgAggregatesApplyOrderByAttribute(
                          aggregateSpec,
                          attribute,
                          attributeName,
                          direction,
                          relation,
                          sql,
                          table,
                          $select
                        );
                      },
                    [
                      aggregateSpec,
                      attribute,
                      attributeName,
                      direction,
                      pgAggregatesApplyOrderByAttribute,
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
                          apply: makeApply("ASC"),
                        },
                      },
                    },
                    [`${baseName}_DESC`]: {
                      extensions: {
                        grafast: {
                          apply: makeApply("DESC"),
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

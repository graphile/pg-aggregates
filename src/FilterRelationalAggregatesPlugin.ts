import type {
  PgCodec,
  PgCodecAttributes,
  PgCondition,
  PgConditionCapableParent,
  PgRegistry,
  PgResource,
  PgResourceParameter,
  PgWhereConditionSpec,
} from "@dataplan/pg";
import type { GrafastInputFieldConfigMap, Modifier } from "grafast";
import type {} from "graphile-build";
import type {
  GraphQLInputObjectType,
  GraphQLInputObjectTypeConfig,
  GraphQLInputType,
} from "graphql";
import type { PgSQL, SQL } from "pg-sql2";
import type {} from "postgraphile-plugin-connection-filter";

import { EXPORTABLE } from "./EXPORTABLE.js";
import type { AggregateSpec } from "./interfaces.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface Build {
      PgAggregateCondition: PgAggregateConditionClass;
      PgAggregateConditionExpression: PgAggregateConditionExpressionClass;
    }
    interface BehaviorStrings {
      "resource:aggregates:filterBy": true;
      "aggregates:filterBy": true;
      "aggregate:filterBy": true;

      "sum:resource:aggregates:filterBy": true;
      "distinctCount:resource:aggregates:filterBy": true;
      "min:resource:aggregates:filterBy": true;
      "max:resource:aggregates:filterBy": true;
      "average:resource:aggregates:filterBy": true;
      "stddevSample:resource:aggregates:filterBy": true;
      "stddevPopulation:resource:aggregates:filterBy": true;
      "varianceSample:resource:aggregates:filterBy": true;
      "variancePopulation:resource:aggregates:filterBy": true;

      "sum:attribute:aggregate:filterBy": true;
      "distinctCount:attribute:aggregate:filterBy": true;
      "min:attribute:aggregate:filterBy": true;
      "max:attribute:aggregate:filterBy": true;
      "average:attribute:aggregate:filterBy": true;
      "stddevSample:attribute:aggregate:filterBy": true;
      "stddevPopulation:attribute:aggregate:filterBy": true;
      "varianceSample:attribute:aggregate:filterBy": true;
      "variancePopulation:attribute:aggregate:filterBy": true;
    }
  }
}

const pgAggregateApplyAttributeOrder = EXPORTABLE(
  () =>
    (
      PgCondition: GraphileBuild.Build["dataplanPg"]["PgCondition"],
      sql: GraphileBuild.Build["sql"],
      spec: AggregateSpec,
      attributeName: string,
      attrCodec: PgCodec,
      rawAttrCodec: PgCodec,
      $parent: PgAggregateConditionExpression,
      input: unknown
    ) => {
      if (input == null) return;
      const $col = new PgCondition($parent);
      $col.extensions.pgFilterAttribute = {
        codec: attrCodec,
        expression: spec.sqlAggregateWrap(
          sql`${$col.alias}.${sql.identifier(attributeName)}`,
          rawAttrCodec
        ),
      };

      return $col;
    },
  [],
  "pgAggregateApplyAttributeOrder"
);

const pgAggregateApplyComputedAttributeOrder = EXPORTABLE(
  () =>
    (
      PgCondition: GraphileBuild.Build["dataplanPg"]["PgCondition"],
      sql: GraphileBuild.Build["sql"],
      spec: AggregateSpec,
      proc: PgResource,
      attrCodec: PgCodec,
      $parent: PgAggregateConditionExpression,
      input: unknown
    ) => {
      if (input == null) return;
      const $col = new PgCondition($parent);
      const sqlComputedAttributeCall = sql.query`${
        typeof proc.from === "function"
          ? proc.from({ placeholder: $col.alias })
          : proc.from
      }`;
      $col.extensions.pgFilterAttribute = {
        codec: attrCodec,
        expression: spec.sqlAggregateWrap(sqlComputedAttributeCall, proc.codec),
      };

      return $col;
    },
  [],
  "pgAggregateApplyComputedAttributeOrder"
);

const pgAggregateApplyForeignCondition = EXPORTABLE(
  () =>
    function (
      PgCondition: GraphileBuild.Build["dataplanPg"]["PgCondition"],
      $subquery: PgAggregateCondition<any>,
      input: unknown
    ) {
      if (input == null) return;
      // Enable all the helpers
      const $condition = new PgCondition($subquery, false, "AND");
      return $condition;
    },
  [],
  "pgAggregateApplyForeignCondition"
);

const pgAggregatesApply = EXPORTABLE(
  () =>
    (
      PgAggregateCondition: PgAggregateConditionClass,
      pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"],
      sql: GraphileBuild.Build["sql"],
      $where: PgCondition<any>,
      input: unknown
    ) => {
      if (input == null) return;
      // assertAllowed(fieldArgs, "object");
      if (!$where.extensions.pgFilterRelation) {
        throw new Error(`Invalid use of filter, 'pgFilterRelation' expected`);
      }
      const { localAttributes, remoteAttributes, tableExpression, alias } =
        $where.extensions.pgFilterRelation;
      const $subQuery = new PgAggregateCondition(
        $where,
        {
          sql,
          tableExpression,
          alias,
        },
        pgWhereConditionSpecListToSQL
      );
      localAttributes.forEach((localAttribute, i) => {
        const remoteAttribute = remoteAttributes[i];
        $subQuery.where(
          sql`${$where.alias}.${sql.identifier(localAttribute as string)} = ${
            $subQuery.alias
          }.${sql.identifier(remoteAttribute as string)}`
        );
      });
      return $subQuery;
    },
  [],
  "pgAggregatesApply"
);

export const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesFilterRelationalAggregatesPlugin",
  description: `\
Adds the ability to filter a collection by aggregates on relationships if you \
have postgraphile-plugin-connection-filter, e.g. filtering all players based on \
the sum of their points scored.`,
  version,

  // This has to run AFTER any plugins that provide `build.pgAggregateSpecs`
  // otherwise we might add codecs to build.allPgCodecs before all the relevant
  // codecs/specs are available.
  after: ["PgBasicsPlugin", "PgCodecsPlugin", "aggregates"],
  provides: ["codecs"],
  before: ["PgConnectionArgFilterPlugin"],

  inflection: {
    add: {
      // TODO: rename this!
      filterTableAggregateType(_preset, foreignTable, spec) {
        const foreignTableTypeName = this.tableType(foreignTable.codec);
        return this.filterType(
          foreignTableTypeName + this.upperCamelCase(spec.id) + "Aggregate"
        );
      },
    },
  },

  schema: {
    behaviorRegistry: {
      add: {
        "aggregates:filterBy": {
          description:
            "Can we filter by the details of this resource whilst aggregating the resource?",
          entities: ["pgResource"],
        },
        "aggregate:filterBy": {
          description: "Can we filter using the value of this attribute",
          entities: ["pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      pgResource: ["aggregates:filterBy", "aggregate:filterBy"],
      pgCodecAttribute: ["aggregate:filterBy"],
    },

    hooks: {
      build(build) {
        const {
          EXPORTABLE,
          grafast: { Modifier },
        } = build;

        if (!build.allPgCodecs) {
          throw new Error(
            "PgAggregatesFilterRelationalAggregatesPlugin must run after build.allPgCodecs has been established"
          );
        }
        if (!build.pgAggregateSpecs) {
          throw new Error(
            "PgAggregatesFilterRelationalAggregatesPlugin must run after build.pgAggregateSpecs has been established"
          );
        }

        // Add aggregate derivative codecs to `allPgCodecs`
        for (const spec of build.pgAggregateSpecs) {
          if (!spec.pgTypeCodecModifier) {
            continue;
          }
          for (const existingCodec of build.allPgCodecs) {
            if (spec.isSuitableType(existingCodec)) {
              const codec = spec.pgTypeCodecModifier(existingCodec);
              if (!build.allPgCodecs.has(codec)) {
                build.allPgCodecs.add(codec);
              }
            }
          }
        }
        const PgAggregateConditionExpression = EXPORTABLE(
          (Modifier) =>
            class PgAggregateConditionExpression
              extends Modifier<PgAggregateCondition<any>>
              implements PgConditionCapableParent
            {
              alias: SQL;
              conditions: PgWhereConditionSpec<any>[] = [];
              constructor(
                parent: PgAggregateCondition<any>,
                private spec: AggregateSpec,
                private pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
              ) {
                super(parent);
                this.alias = parent.alias;
              }

              where(condition: PgWhereConditionSpec<any>): void {
                this.conditions.push(condition);
              }

              apply(): void {
                const sqlCondition = this.pgWhereConditionSpecListToSQL(
                  this.alias,
                  this.conditions
                );
                if (sqlCondition) {
                  this.parent.expression(sqlCondition);
                }
              }
            } as PgAggregateConditionExpressionClass,
          [Modifier]
        );
        const PgAggregateCondition = EXPORTABLE(
          (Modifier, PgAggregateConditionExpression) =>
            class PgAggregateCondition<
              TParentStep extends PgConditionCapableParent
            > extends Modifier<TParentStep> {
              sql: PgSQL;
              tableExpression: SQL;
              alias: SQL;
              conditions: PgWhereConditionSpec<any>[] = [];
              expressions: SQL[] = [];
              constructor(
                parent: TParentStep,
                options: {
                  sql: PgSQL;
                  tableExpression: SQL;
                  alias?: string;
                },
                private pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
              ) {
                super(parent);
                const { sql, tableExpression, alias } = options;
                this.sql = sql;
                this.alias = sql.identifier(Symbol(alias ?? "aggregate"));
                this.tableExpression = tableExpression;
              }

              where(condition: PgWhereConditionSpec<any>): void {
                this.conditions.push(condition);
              }

              expression(expression: SQL): void {
                this.expressions.push(expression);
              }

              forAggregate(
                spec: AggregateSpec
              ): PgAggregateConditionExpression {
                return new PgAggregateConditionExpression(
                  this,
                  spec,
                  this.pgWhereConditionSpecListToSQL
                );
              }

              apply(): void {
                const { sql } = this;

                const sqlCondition = this.pgWhereConditionSpecListToSQL(
                  this.alias,
                  this.conditions
                );
                const where = sqlCondition
                  ? sql`where ${sqlCondition}`
                  : sql.blank;
                const boolExpr =
                  this.expressions.length === 0
                    ? sql.true
                    : sql.parens(
                        sql.join(
                          this.expressions.map((expr) => sql.parens(expr)),
                          "\nand\n"
                        )
                      );
                const subquery = sql`(${sql.indent`\
select ${boolExpr}
from ${this.tableExpression} as ${this.alias}
${where}`}
group by ())`;
                return this.parent.where(subquery);
              }
            } as PgAggregateConditionClass,
          [Modifier, PgAggregateConditionExpression]
        );

        return build.extend(
          build,
          {
            PgAggregateCondition,
            PgAggregateConditionExpression,
          },
          "Adding step classes from postgraphile-plugin-connection-filter"
        );
      },

      init(_, build) {
        const {
          inflection,
          dataplanPg: { PgCondition },
          EXPORTABLE,
        } = build;

        if (!inflection.filterType) {
          // Filter plugin is not enabled
          return _;
        }

        // Register the aggregate filter type for each table
        for (const foreignTable of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (foreignTable.parameters || !foreignTable.codec.attributes) {
            continue;
          }
          if (
            !build.behavior.pgResourceMatches(
              foreignTable,
              "resource:aggregates:filterBy"
            )
          ) {
            continue;
          }

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);
          const foreignTableFilterTypeName =
            inflection.filterType(foreignTableTypeName);
          const foreignTableAggregateFilterTypeName = inflection.filterType(
            foreignTableTypeName + "Aggregates"
          );

          build.recoverable(null, () => {
            // TODO: inflect
            const filterFieldName = "filter";
            build.registerInputObjectType(
              foreignTableAggregateFilterTypeName,
              {
                pgResource: foreignTable,
                isPgConnectionAggregateFilter: true,
              },
              () => {
                return {
                  description: `A filter to be used against aggregates of \`${foreignTableTypeName}\` object types.`,
                  fields: () => {
                    const type = build.getTypeByName(
                      foreignTableFilterTypeName
                    ) as GraphQLInputObjectType;
                    if (!type) {
                      return {};
                    }
                    return {
                      [filterFieldName as string]: {
                        description: `A filter that must pass for the relevant \`${foreignTableTypeName}\` object to be included within the aggregate.`,
                        type,
                        apply: EXPORTABLE(
                          (PgCondition, pgAggregateApplyForeignCondition) =>
                            (
                              $subquery: PgAggregateCondition<any>,
                              input: unknown
                            ) =>
                              pgAggregateApplyForeignCondition(
                                PgCondition,
                                $subquery,
                                input
                              ),
                          [PgCondition, pgAggregateApplyForeignCondition],
                          `${filterFieldName}Apply`
                        ),
                        // No need to auto-apply since we're applied manually via `fieldArgs.apply($subQuery)` below.
                      },
                    };
                  },
                } as Omit<GraphQLInputObjectTypeConfig, "name">;
              },
              "Adding aggregate filter input type"
            );
          });

          // Register the aggregate spec filter type for each aggreage spec for each source
          for (const spec of build.pgAggregateSpecs) {
            if (
              !build.behavior.pgResourceMatches(
                foreignTable,
                `${spec.id}:resource:aggregates:filterBy`
              )
            ) {
              continue;
            }
            const filterTypeName = inflection.filterTableAggregateType(
              foreignTable,
              spec
            );
            build.registerInputObjectType(
              filterTypeName,
              {
                isPgConnectionAggregateAggregateFilter: true,
                pgConnectionAggregateFilterAggregateSpec: spec,
                pgTypeResource: foreignTable,
              },
              () => ({}),
              `Add '${spec.id}' aggregate filter type for '${foreignTableTypeName}'`
            );
          }
        }

        return _;
      },

      // This hook adds 'aggregates' under a "backwards" relation, siblings of
      // every, some, none.
      // See https://github.com/graphile-contrib/postgraphile-plugin-connection-filter/blob/6223cdb1d2ac5723aecdf55f735a18f8e2b98683/src/PgConnectionArgFilterBackwardRelationsPlugin.ts#L374
      GraphQLInputObjectType_fields(inFields, build, context) {
        let fields = inFields;
        const {
          extend,
          inflection,
          sql,
          pgAggregateSpecs,
          dataplanPg: { PgCondition, pgWhereConditionSpecListToSQL },
          PgAggregateCondition,
          EXPORTABLE,
        } = build;

        if (!inflection.filterType) {
          // Filter plugin is not enabled
          return inFields;
        }

        const {
          fieldWithHooks,
          scope: {
            foreignTable,
            isPgConnectionFilterMany,
            isPgConnectionAggregateFilter,
            pgResource,
            isPgConnectionAggregateAggregateFilter,
            pgConnectionAggregateFilterAggregateSpec: spec,
            pgTypeResource,
          },
        } = context;

        // Add 'aggregates' field to relation filters, next to `every`/`some`/`none`
        fields = (() => {
          if (!isPgConnectionFilterMany || !foreignTable) return fields;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);
          const foreignTableAggregateFilterTypeName = inflection.filterType(
            foreignTableTypeName + "Aggregates"
          );

          const fieldName = "aggregates";

          const AggregateType = build.getTypeByName(
            foreignTableAggregateFilterTypeName
          ) as GraphQLInputObjectType;
          if (!AggregateType) {
            return fields;
          }

          return build.extend(
            fields,
            {
              [fieldName]: fieldWithHooks(
                {
                  fieldName,
                  isPgConnectionFilterAggregatesField: true,
                },
                {
                  description: `Aggregates across related \`${foreignTableTypeName}\` match the filter criteria.`,
                  type: AggregateType,
                  apply: EXPORTABLE(
                    (
                      PgAggregateCondition,
                      pgAggregatesApply,
                      pgWhereConditionSpecListToSQL,
                      sql
                    ) =>
                      function ($where: PgCondition<any>, input: unknown) {
                        return pgAggregatesApply(
                          PgAggregateCondition,
                          pgWhereConditionSpecListToSQL,
                          sql,
                          $where,
                          input
                        );
                      },
                    [
                      PgAggregateCondition,
                      pgAggregatesApply,
                      pgWhereConditionSpecListToSQL,
                      sql,
                    ]
                  ),
                  // No need to auto-apply, postgraphile-plugin-connection-filter explicitly calls fieldArgs.apply()
                }
              ),
            },
            "Adding 'aggregates' filter field on relation"
          );
        })();

        // This hook adds our various aggregates to the 'aggregates' input defined in `AggregateType` above
        fields = (() => {
          if (
            !isPgConnectionAggregateFilter ||
            !pgResource ||
            pgResource.parameters ||
            !pgResource.codec.attributes
          ) {
            return fields;
          }
          const foreignTable = pgResource;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);

          return pgAggregateSpecs.reduce((memo, spec) => {
            const filterTypeName = inflection.filterTableAggregateType(
              foreignTable,
              spec
            );
            const fieldName = inflection.camelCase(spec.id);

            const type = build.getTypeByName(
              filterTypeName
            ) as GraphQLInputType;
            if (!type) {
              return memo;
            }
            return extend(
              memo,
              {
                [fieldName]: fieldWithHooks({ fieldName }, () => ({
                  type,
                  description: `${spec.HumanLabel} aggregate over matching \`${foreignTableTypeName}\` objects.`,
                  apply: EXPORTABLE(
                    (spec) =>
                      function (
                        $subquery: PgAggregateCondition<any>,
                        input: unknown
                      ) {
                        if (input == null) return;
                        return $subquery.forAggregate(spec);
                      },
                    [spec]
                  ),
                })),
              },
              `Adding aggregate '${spec.id}' filter input for '${pgResource.name}'. `
            );
          }, fields);
        })();

        // This hook adds matching attributes to the relevant aggregate types.
        fields = (() => {
          if (
            !isPgConnectionAggregateAggregateFilter ||
            !spec ||
            !pgTypeResource ||
            pgTypeResource.parameters ||
            !pgTypeResource.codec.attributes
          ) {
            return fields;
          }
          const table = pgTypeResource;

          const attributes: PgCodecAttributes = table.codec.attributes;

          fields = extend(
            fields,
            {
              ...Object.entries(attributes).reduce(
                (memo, [attributeName, attribute]) => {
                  if (
                    !build.behavior.pgCodecAttributeMatches(
                      [table.codec, attributeName],
                      `${spec.id}:attribute:aggregate:filterBy`
                    )
                  ) {
                    return memo;
                  }
                  if (
                    (spec.shouldApplyToEntity &&
                      !spec.shouldApplyToEntity({
                        type: "attribute",
                        codec: table.codec,
                        attributeName: attributeName,
                      })) ||
                    !spec.isSuitableType(attribute.codec)
                  ) {
                    return memo;
                  }
                  const rawAttrCodec = attribute.codec;
                  const attrCodec = spec.pgTypeCodecModifier
                    ? spec.pgTypeCodecModifier(attribute.codec)
                    : attribute.codec;
                  const fieldName = inflection.attribute({
                    codec: table.codec,
                    attributeName,
                  });

                  const digest =
                    build.connectionFilterOperatorsDigest(attrCodec);
                  if (!digest) {
                    return memo;
                  }
                  const OperatorsType = build.getTypeByName(
                    digest.operatorsTypeName
                  ) as GraphQLInputObjectType;

                  if (!OperatorsType) {
                    return memo;
                  }

                  return build.extend(
                    memo,
                    {
                      [fieldName]: {
                        type: OperatorsType,
                        apply: EXPORTABLE(
                          (
                            PgCondition,
                            attrCodec,
                            attributeName,
                            pgAggregateApplyAttributeOrder,
                            rawAttrCodec,
                            spec,
                            sql
                          ) =>
                            function (
                              $parent: PgAggregateConditionExpression,
                              input: unknown
                            ) {
                              return pgAggregateApplyAttributeOrder(
                                PgCondition,
                                sql,
                                spec,
                                attributeName,
                                attrCodec,
                                rawAttrCodec,
                                $parent,
                                input
                              );
                            },
                          [
                            PgCondition,
                            attrCodec,
                            attributeName,
                            pgAggregateApplyAttributeOrder,
                            rawAttrCodec,
                            spec,
                            sql,
                          ]
                        ),
                        // No need to auto-apply since we're called via `fieldArgs.apply($subquery.forAggregate(spec))` above
                      },
                    },
                    `Add aggregate '${attributeName}' filter for source '${table.name}' for spec '${spec.id}'`
                  );
                },
                Object.create(null) as GrafastInputFieldConfigMap<any>
              ),
            },
            `Adding per-attribute '${spec.id}' aggregate filters for '${pgTypeResource.name}'`
          );

          const computedAttributeResources = (
            Object.values(build.input.pgRegistry.pgResources) as PgResource[]
          ).filter(
            (
              s
            ): s is PgResource<
              string,
              PgCodec,
              never[],
              PgResourceParameter[],
              PgRegistry
            > =>
              isComputedScalarAttributeResource(s) &&
              s.parameters[0].codec === table.codec &&
              s.parameters.slice(1).every((p) => p.required === false)
          );

          fields = extend(
            fields,
            {
              ...computedAttributeResources.reduce((memo, proc) => {
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity({
                      type: "computedAttribute",
                      resource: proc,
                    })) ||
                  !spec.isSuitableType(proc.codec)
                ) {
                  return memo;
                }
                const fieldName = inflection.computedAttributeField({
                  resource: proc,
                });

                const attrCodec = spec.pgTypeCodecModifier
                  ? spec.pgTypeCodecModifier(proc.codec)
                  : proc.codec;
                const digest = build.connectionFilterOperatorsDigest(attrCodec);
                if (!digest) {
                  return memo;
                }
                const OperatorsType = build.getTypeByName(
                  digest.operatorsTypeName
                ) as GraphQLInputObjectType;

                if (!OperatorsType) {
                  return memo;
                }

                return build.extend(
                  memo,
                  {
                    [fieldName]: {
                      type: OperatorsType,
                      apply: EXPORTABLE(
                        (
                          PgCondition,
                          attrCodec,
                          pgAggregateApplyComputedAttributeOrder,
                          proc,
                          spec,
                          sql
                        ) =>
                          function apply(
                            $parent: PgAggregateConditionExpression,
                            input: unknown
                          ) {
                            return pgAggregateApplyComputedAttributeOrder(
                              PgCondition,
                              sql,
                              spec,
                              proc,
                              attrCodec,
                              $parent,
                              input
                            );
                          },
                        [
                          PgCondition,
                          attrCodec,
                          pgAggregateApplyComputedAttributeOrder,
                          proc,
                          spec,
                          sql,
                        ]
                      ),
                    },
                  },
                  `Add computed aggregate '${fieldName}' filter for source '${table.name}' for spec '${spec.id}'`
                );
              }, Object.create(null) as GrafastInputFieldConfigMap<PgAggregateConditionExpression>),
            },
            `Adding per-computed-column '${spec.id}' aggregate filters for '${pgTypeResource.name}'`
          );

          return fields;
        })();

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesFilterRelationalAggregatesPlugin };

interface PgAggregateCondition<TParentStep extends PgConditionCapableParent>
  extends Modifier<TParentStep> {
  sql: PgSQL;
  tableExpression: SQL;
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[];
  expressions: SQL[];
  where(condition: PgWhereConditionSpec<any>): void;
  expression(expression: SQL): void;
  forAggregate(spec: AggregateSpec): PgAggregateConditionExpression;
  apply(): void;
}

interface PgAggregateConditionClass {
  new <TParentStep extends PgConditionCapableParent>(
    $parent: TParentStep,
    options: {
      sql: PgSQL;
      tableExpression: SQL;
      alias?: string;
    },
    pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
  ): PgAggregateCondition<TParentStep>;
}

interface PgAggregateConditionExpression
  extends Modifier<PgAggregateCondition<any>> {
  alias: SQL;
  conditions: PgWhereConditionSpec<any>[];

  where(condition: PgWhereConditionSpec<any>): void;

  apply(): void;
}

interface PgAggregateConditionExpressionClass {
  new (
    $parent: PgAggregateCondition<any>,
    spec: AggregateSpec,
    pgWhereConditionSpecListToSQL: GraphileBuild.Build["dataplanPg"]["pgWhereConditionSpecListToSQL"]
  ): PgAggregateConditionExpression;
}

function isComputedScalarAttributeResource(
  s: PgResource<any, any, any, any, any>
): s is PgResource<
  string,
  PgCodec,
  never[],
  PgResourceParameter[],
  PgRegistry
> {
  if (!s.parameters || s.parameters.length < 1) {
    return false;
  }
  if (s.codec.attributes) {
    return false;
  }
  if (!s.isUnique) {
    return false;
  }
  const firstParameter = s.parameters[0] as PgResourceParameter;
  if (!firstParameter?.codec.attributes) {
    return false;
  }
  return true;
}

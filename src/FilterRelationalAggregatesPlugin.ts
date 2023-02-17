import type { PgTypeColumns } from "@dataplan/pg";
import "postgraphile-plugin-connection-filter";
import type {
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
} from "graphql";
import { AggregateSpec } from "./interfaces";

const { version } = require("../package.json");

export const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesFilterRelationalAggregatesPlugin",
  version,

  // This has to run AFTER any plugins that provide `build.pgAggregateSpecs`
  // otherwise we might add codecs to build.allPgCodecs before all the relevant
  // codecs/specs are available.
  after: ["PgCodecsPlugin", "aggregates"],
  provides: ["codecs"],
  before: ["PgConnectionArgFilterPlugin"],

  inflection: {
    add: {
      // TODO: rename this!
      filterSomethingSomethingRenameMe(_preset, foreignTable, spec) {
        const foreignTableTypeName = this.tableType(foreignTable.codec);
        return this.filterType(
          foreignTableTypeName + this.upperCamelCase(spec.id) + "Aggregate"
        );
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
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

        return build;
      },

      init(_, build, context) {
        const { inflection } = build;

        // Register the aggregate filter type for each table
        for (const foreignTable of build.input.pgSources) {
          if (foreignTable.parameters || !foreignTable.codec.columns) {
            continue;
          }
          // TODO: if behavior includes filter:aggregates

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
                pgSource: foreignTable,
                isPgConnectionAggregateFilter: true,
              },
              () => {
                const type = build.getTypeByName(
                  foreignTableFilterTypeName
                ) as GraphQLInputObjectType;
                if (!type) {
                  return {};
                }
                return {
                  description: `A filter to be used against aggregates of \`${foreignTableTypeName}\` object types.`,
                  fields: {
                    [filterFieldName]: {
                      description: `A filter that must pass for the relevant \`${foreignTableTypeName}\` object to be included within the aggregate.`,
                      type,
                      // TODO: plan
                    },
                  },
                };
              },
              "Adding aggregate filter input type"
            );
          });

          // Register the aggregate spec filter type for each aggreage spec for each source
          for (const spec of build.pgAggregateSpecs) {
            const filterTypeName = inflection.filterSomethingSomethingRenameMe(
              foreignTable,
              spec
            );
            build.registerInputObjectType(
              filterTypeName,
              {
                isPgConnectionAggregateAggregateFilter: true,
                pgConnectionAggregateFilterAggregateSpec: spec,
                pgTypeSource: foreignTable,
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

        // Add 'aggregates' field to relation filters, next to `every`/`some`/`none`
        fields = (() => {
          const { inflection } = build;
          const {
            fieldWithHooks,
            scope: { foreignTable, isPgConnectionFilterMany },
          } = context;

          if (!isPgConnectionFilterMany || !foreignTable) return fields;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);
          const foreignTableAggregateFilterTypeName = inflection.filterType(
            foreignTableTypeName + "Aggregates"
          );

          const fieldName = "aggregates";

          const AggregateType = build.getTypeByName(
            foreignTableAggregateFilterTypeName
          );
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
                  // TODO: plan
                }
              ),
            },
            "Adding 'aggregates' filter field on relation"
          );

          /*
          const resolve: ConnectionFilterResolver = ({
            sourceAlias,
            fieldValue,
            queryBuilder,
            parentFieldInfo,
          }) => {
            if (fieldValue == null) return null;

            if (!parentFieldInfo || !parentFieldInfo.backwardRelationSpec) {
              throw new Error("Did not receive backward relation spec");
            }
            const {
              keyAttributes,
              foreignKeyAttributes,
            }: BackwardRelationSpec = parentFieldInfo.backwardRelationSpec;

            const foreignTableAlias = sql.identifier(Symbol());
            const sqlIdentifier = sql.identifier(
              foreignTable.namespace.name,
              foreignTable.name
            );
            const sqlKeysMatch = sql.query`(${sql.join(
              foreignKeyAttributes.map((attr, i) => {
                return sql.fragment`${foreignTableAlias}.${sql.identifier(
                  attr.name
                )} = ${sourceAlias}.${sql.identifier(keyAttributes[i].name)}`;
              }),
              ") and ("
            )})`;

            // Since we want `aggregates: {filter: {...}, sum: {...}}` at the same
            // level, we extract the filter for the `where` clause whilst
            // extracting all the other fields for the `select` clause.
            const { [filterFieldName]: filter, ...rest } = fieldValue as any;
            if (Object.keys(rest).length === 0) {
              const fieldNames = Object.keys(AggregateType.getFields()).filter(
                (n) => n !== filterFieldName
              );
              const lastFieldName = fieldNames.pop();
              throw new Error(
                `'aggregates' filter must specify at least one aggregate: ${
                  fieldNames.length > 0
                    ? `'${fieldNames.join("', '")}' or `
                    : ""
                }'${lastFieldName}').`
              );
            }
            const sqlFragment = filter
              ? connectionFilterResolve(
                  filter,
                  foreignTableAlias,
                  foreignTableFilterTypeName,
                  queryBuilder
                )
              : sql.fragment`true`;
            const sqlAggregateConditions = connectionFilterResolve(
              rest,
              foreignTableAlias,
              foreignTableAggregateFilterTypeName,
              queryBuilder
            );
            //const sqlAggregateConditions = [sql.fragment`sum(saves) > 9`];
            const sqlSelectWhereKeysMatch = sql.query`(select (${sqlAggregateConditions}) from (
          select * from ${sqlIdentifier} as ${foreignTableAlias}
          where ${sqlKeysMatch}
          and (${sqlFragment})
        ) as ${foreignTableAlias}
          };
          */
        })();

        // This hook adds our various aggregates to the 'aggregates' input defined in `AggregateType` above
        fields = (() => {
          const { extend, inflection, pgAggregateSpecs } = build;
          const {
            fieldWithHooks,
            scope: { isPgConnectionAggregateFilter, pgSource },
          } = context;

          if (
            !isPgConnectionAggregateFilter ||
            !pgSource ||
            pgSource.parameters ||
            !pgSource.codec.columns
          ) {
            return fields;
          }
          const foreignTable = pgSource;

          const foreignTableTypeName = inflection.tableType(foreignTable.codec);

          return pgAggregateSpecs.reduce((memo, spec) => {
            const filterTypeName = inflection.filterSomethingSomethingRenameMe(
              foreignTable,
              spec
            );
            const fieldName = inflection.camelCase(spec.id);

            /*
            const resolve: ConnectionFilterResolver = ({
              sourceAlias,
              fieldValue,
              queryBuilder,
              //parentFieldInfo,
            }) => {
              if (fieldValue == null) return null;
              const sqlFrag = connectionFilterResolve(
                fieldValue,
                sourceAlias,
                filterTypeName,
                queryBuilder
              );
              return sqlFrag;
            };
            */

            const type = build.getTypeByName(filterTypeName);
            if (!type) {
              return memo;
            }
            return extend(
              memo,
              {
                [fieldName]: fieldWithHooks({ fieldName }, () => ({
                  type,
                  description: `${spec.HumanLabel} aggregate over matching \`${foreignTableTypeName}\` objects.`,
                  // TODO: plan
                })),
              },
              `Adding aggregate '${spec.id}' filter input for '${pgSource.name}'. `
            );
          }, fields);
        })();

        // This hook adds matching columns to the relevant aggregate types.
        fields = (() => {
          const { extend, inflection } = build;
          const {
            scope: {
              isPgConnectionAggregateAggregateFilter,
              pgConnectionAggregateFilterAggregateSpec: spec,
              pgTypeSource,
            },
          } = context;

          if (
            !isPgConnectionAggregateAggregateFilter ||
            !spec ||
            !pgTypeSource ||
            pgTypeSource.parameters ||
            !pgTypeSource.codec.columns
          ) {
            return fields;
          }
          const table = pgTypeSource;

          const columns: PgTypeColumns = table.codec.columns;

          return extend(
            fields,
            {
              ...Object.entries(columns).reduce((memo, [columnName, attr]) => {
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity({
                      type: "column",
                      codec: table.codec,
                      columnName,
                    })) ||
                  !spec.isSuitableType(attr.codec)
                ) {
                  return memo;
                }
                const attrCodec = spec.pgTypeCodecModifier
                  ? spec.pgTypeCodecModifier(attr.codec)
                  : attr.codec;
                const fieldName = inflection.column({
                  codec: table.codec,
                  columnName,
                });

                const digest = build.connectionFilterOperatorsDigest(attrCodec);
                if (!digest) {
                  return memo;
                }
                const OperatorsType = build.getTypeByName(
                  digest.operatorsTypeName
                ) as GraphQLInputObjectType;
                /*
                const OperatorsType: GraphQLInputObjectType | undefined =
                  connectionFilterOperatorsType(
                    newWithHooks,
                    pgType.id,
                    pgTypeModifier
                  );
                */

                if (!OperatorsType) {
                  return memo;
                }
                /*
                const resolve: ConnectionFilterResolver = ({
                  sourceAlias,
                  fieldName,
                  fieldValue,
                  queryBuilder,
                }) => {
                  if (fieldValue == null) return null;
                  const sqlColumn = sql.query`${sourceAlias}.${sql.identifier(
                    attr.name
                  )}`;
                  const sqlAggregate = spec.sqlAggregateWrap(sqlColumn);
                  const frag = connectionFilterResolve(
                    fieldValue,
                    sqlAggregate,
                    OperatorsType.name,
                    queryBuilder,
                    pgType,
                    pgTypeModifier,
                    fieldName
                  );
                  return frag;
                };
                */

                return build.extend(
                  memo,
                  {
                    [fieldName]: {
                      type: OperatorsType,
                      // TODO: plan
                    },
                  },
                  `Add aggregate '${columnName}' filter for source '${table.name}' for spec '${spec.id}'`
                );
              }, Object.create(null) as GraphQLInputFieldConfigMap),

              /*
              ...pgIntrospectionResultsByKind.procedure.reduce((memo, proc) => {
                if (proc.returnsSet) {
                  return memo;
                }
                const type =
                  pgIntrospectionResultsByKind.typeById[proc.returnTypeId];
                if (
                  (spec.shouldApplyToEntity &&
                    !spec.shouldApplyToEntity(proc)) ||
                  !spec.isSuitableType(type)
                ) {
                  return memo;
                }
                const computedColumnDetails = getComputedColumnDetails(
                  build,
                  table,
                  proc
                );
                if (!computedColumnDetails) {
                  return memo;
                }
                const { pseudoColumnName } = computedColumnDetails;
                const fieldName = inflection.computedColumn(
                  pseudoColumnName,
                  proc,
                  table
                );

                const OperatorsType: GraphQLInputObjectType | undefined =
                  connectionFilterOperatorsType(newWithHooks, type.id, null);

                if (!OperatorsType) {
                  return memo;
                }

                const resolve: ConnectionFilterResolver = ({
                  sourceAlias,
                  fieldName,
                  fieldValue,
                  queryBuilder,
                }) => {
                  if (fieldValue == null) return null;
                  const sqlComputedColumnCall = sql.query`${sql.identifier(
                    proc.namespaceName,
                    proc.name
                  )}(${sourceAlias})`;
                  const sqlAggregate = spec.sqlAggregateWrap(
                    sqlComputedColumnCall
                  );
                  const frag = connectionFilterResolve(
                    fieldValue,
                    sqlAggregate,
                    OperatorsType.name,
                    queryBuilder,
                    type,
                    null,
                    fieldName
                  );
                  return frag;
                };
                connectionFilterRegisterResolver(Self.name, fieldName, resolve);

                return build.extend(memo, {
                  [fieldName]: {
                    type: OperatorsType,
                  },
                });
              }, Object.create(null) as GraphQLInputFieldConfigMap),
              */
            },
            `Adding per-column '${spec.id}' aggregate filters for '${pgTypeSource.name}'`
          );
        })();

        return fields;
      },
    },
  },
};

export { Plugin as PgAggregatesFilterRelationalAggregatesPlugin };

import type { Plugin } from "graphile-build";
import type { ConnectionFilterResolver } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterPlugin";
import type { BackwardRelationSpec } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterBackwardRelationsPlugin";
import type { PgEntity, PgIntrospectionResultsByKind } from "graphile-build-pg";
import type {
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
} from "graphql";
import { AggregateSpec } from "./interfaces";

const FilterRelationalAggregatesPlugin: Plugin = (builder, options) => {
  // This hook adds 'aggregates' under a "backwards" relation, siblings of
  // every, some, none.
  // See https://github.com/graphile-contrib/postgraphile-plugin-connection-filter/blob/6223cdb1d2ac5723aecdf55f735a18f8e2b98683/src/PgConnectionArgFilterBackwardRelationsPlugin.ts#L374
  builder.hook("GraphQLInputObjectType:fields", (fields, build, context) => {
    const {
      extend,
      newWithHooks,
      inflection,
      pgSql: sql,
      connectionFilterResolve,
      connectionFilterRegisterResolver,
      connectionFilterTypesByTypeName,
      connectionFilterType,
      graphql,
    } = build;
    const {
      fieldWithHooks,
      scope: { foreignTable, isPgConnectionFilterMany },
      Self,
    } = context;

    if (!isPgConnectionFilterMany || !foreignTable) return fields;
    if (
      foreignTable.tags.aggregates === "off" || (
        options.disableAggregatesByDefault &&
        foreignTable.tags.aggregates !== "on"
      )
    ) {
      return fields;
    }

    connectionFilterTypesByTypeName[Self.name] = Self;

    const foreignTableTypeName = inflection.tableType(foreignTable);
    const foreignTableFilterTypeName = inflection.filterType(
      foreignTableTypeName
    );
    const foreignTableAggregateFilterTypeName = inflection.filterType(
      foreignTableTypeName + "Aggregates"
    );

    const FilterType: GraphQLInputObjectType = connectionFilterType(
      newWithHooks,
      foreignTableFilterTypeName,
      foreignTable,
      foreignTableTypeName
    );

    const filterFieldName = "filter";

    const AggregateType: GraphQLInputObjectType | undefined = (() => {
      if (
        !(
          foreignTableAggregateFilterTypeName in connectionFilterTypesByTypeName
        )
      ) {
        connectionFilterTypesByTypeName[
          foreignTableAggregateFilterTypeName
        ] = newWithHooks(
          graphql.GraphQLInputObjectType,
          {
            description: `A filter to be used against aggregates of \`${foreignTableTypeName}\` object types.`,
            name: foreignTableAggregateFilterTypeName,
            fields: {
              [filterFieldName]: {
                description: `A filter that must pass for the relevant \`${foreignTableTypeName}\` object to be included within the aggregate.`,
                type: FilterType,
              },
            },
          },
          {
            pgIntrospection: foreignTable,
            isPgConnectionAggregateFilter: true,
          },
          true
        );
      }
      return connectionFilterTypesByTypeName[
        foreignTableAggregateFilterTypeName
      ];
    })();

    if (!AggregateType) {
      return fields;
    }

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
            fieldNames.length > 0 ? `'${fieldNames.join("', '")}' or ` : ""
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
      )`;
      return sqlSelectWhereKeysMatch;
    };

    const fieldName = "aggregates";
    connectionFilterRegisterResolver(Self.name, fieldName, resolve);

    return extend(fields, {
      [fieldName]: fieldWithHooks(
        fieldName,
        {
          description: `Aggregates across related \`${foreignTableTypeName}\` match the filter criteria.`,
          type: AggregateType,
        },
        {
          isPgConnectionFilterAggregatesField: true,
        }
      ),
    });
  });

  // This hook adds our various aggregates to the 'aggregates' input defined in `AggregateType` above
  builder.hook("GraphQLInputObjectType:fields", (fields, build, context) => {
    const {
      extend,
      graphql,
      newWithHooks,
      inflection,
      connectionFilterResolve,
      connectionFilterRegisterResolver,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgConnectionAggregateFilter },
      Self,
    } = context;
    const pgIntrospection: PgEntity | undefined = context.scope.pgIntrospection;
    const pgAggregateSpecs: AggregateSpec[] = build.pgAggregateSpecs;

    if (
      !isPgConnectionAggregateFilter ||
      !pgIntrospection ||
      pgIntrospection.kind !== "class"
    ) {
      return fields;
    }
    const foreignTable = pgIntrospection;

    const foreignTableTypeName = inflection.tableType(foreignTable);

    return pgAggregateSpecs.reduce((memo, spec) => {
      const filterTypeName = inflection.filterType(
        foreignTableTypeName + inflection.upperCamelCase(spec.id) + "Aggregate"
      );
      const AggregateType = newWithHooks(
        graphql.GraphQLInputObjectType,
        {
          name: filterTypeName,
        },
        {
          isPgConnectionAggregateAggregateFilter: true,
          pgConnectionAggregateFilterAggregateSpec: spec,
          pgIntrospection,
        },
        true
      );
      if (!AggregateType) {
        return memo;
      }
      const fieldName = inflection.camelCase(spec.id);

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
      connectionFilterRegisterResolver(Self.name, fieldName, resolve);

      return extend(
        memo,
        {
          [fieldName]: fieldWithHooks(fieldName, {
            type: AggregateType,
            description: `${spec.HumanLabel} aggregate over matching \`${foreignTableTypeName}\` objects.`,
          }),
        },
        `Adding aggregate '${spec.id}' filter input for '${pgIntrospection.name}'. `
      );
    }, fields);
  });

  // This hook adds matching columns to the relevant aggregate types.
  builder.hook("GraphQLInputObjectType:fields", (fields, build, context) => {
    const {
      extend,
      inflection,
      connectionFilterOperatorsType,
      newWithHooks,
      pgSql: sql,
      connectionFilterResolve,
      connectionFilterRegisterResolver,
      pgGetComputedColumnDetails: getComputedColumnDetails,
    } = build;
    const pgIntrospectionResultsByKind: PgIntrospectionResultsByKind =
      build.pgIntrospectionResultsByKind;
    const {
      scope: { isPgConnectionAggregateAggregateFilter },
      Self,
    } = context;

    const spec: AggregateSpec | undefined =
      context.scope.pgConnectionAggregateFilterAggregateSpec;
    const pgIntrospection: PgEntity | undefined = context.scope.pgIntrospection;

    if (
      !isPgConnectionAggregateAggregateFilter ||
      !spec ||
      !pgIntrospection ||
      pgIntrospection.kind !== "class"
    ) {
      return fields;
    }
    const table = pgIntrospection;

    return extend(fields, {
      ...table.attributes.reduce((memo, attr) => {
        if (
          (spec.shouldApplyToEntity && !spec.shouldApplyToEntity(attr)) ||
          !spec.isSuitableType(attr.type)
        ) {
          return memo;
        }
        const [pgType, pgTypeModifier] = spec.pgTypeAndModifierModifier
          ? spec.pgTypeAndModifierModifier(attr.type, attr.typeModifier)
          : [attr.type, attr.typeModifier];
        const fieldName = inflection.column(attr);

        const OperatorsType:
          | GraphQLInputObjectType
          | undefined = connectionFilterOperatorsType(
          newWithHooks,
          pgType.id,
          pgTypeModifier
        );

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
        connectionFilterRegisterResolver(Self.name, fieldName, resolve);

        return build.extend(memo, {
          [fieldName]: {
            type: OperatorsType,
          },
        });
      }, {} as GraphQLInputFieldConfigMap),

      ...pgIntrospectionResultsByKind.procedure.reduce((memo, proc) => {
        if (proc.returnsSet) {
          return memo;
        }
        const type = pgIntrospectionResultsByKind.typeById[proc.returnTypeId];
        if (
          (spec.shouldApplyToEntity && !spec.shouldApplyToEntity(proc)) ||
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

        const OperatorsType:
          | GraphQLInputObjectType
          | undefined = connectionFilterOperatorsType(
          newWithHooks,
          type.id,
          null
        );

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
          const sqlAggregate = spec.sqlAggregateWrap(sqlComputedColumnCall);
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
      }, {} as GraphQLInputFieldConfigMap),
    });
  });
};

export default FilterRelationalAggregatesPlugin;

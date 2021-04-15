import type { Plugin } from "graphile-build";
import type { ConnectionFilterResolver } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterPlugin";
import type { BackwardRelationSpec } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterBackwardRelationsPlugin";
import { PgEntity, PgEntityKind } from "graphile-build-pg";
import { GraphQLInputFieldConfigMap } from "graphql";
import { AggregateSpec } from "./interfaces";

const FilterRelationalAggregatesPlugin: Plugin = (builder) => {
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

    connectionFilterTypesByTypeName[Self.name] = Self;

    const foreignTableTypeName = inflection.tableType(foreignTable);
    const foreignTableFilterTypeName = inflection.filterType(
      foreignTableTypeName
    );
    const foreignTableAggregateFilterTypeName = inflection.filterType(
      foreignTableTypeName + "Aggregates"
    );

    const FilterType = connectionFilterType(
      newWithHooks,
      foreignTableFilterTypeName,
      foreignTable,
      foreignTableTypeName
    );

    const AggregateType = (() => {
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
              filter: {
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
      // fieldName,
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
      const { filter, ...rest } = fieldValue as any;
      const sqlFragment = connectionFilterResolve(
        filter,
        foreignTableAlias,
        foreignTableFilterTypeName,
        queryBuilder
      );
      const sqlAggregateConditions = connectionFilterResolve(
        rest,
        foreignTableAlias,
        foreignTableFilterTypeName,
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

    const aggregatesFieldName = "aggregates";
    connectionFilterRegisterResolver(Self.name, aggregatesFieldName, resolve);

    return extend(fields, {
      [aggregatesFieldName]: fieldWithHooks(
        aggregatesFieldName,
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
      //pgSql: sql,
      //connectionFilterResolve,
      //connectionFilterRegisterResolver,
      //connectionFilterTypesByTypeName,
      //connectionFilterType,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgConnectionAggregateFilter },
    } = context;
    const pgIntrospection: PgEntity | undefined = context.scope.pgIntrospection;
    const pgAggregateSpecs: AggregateSpec[] = build.pgAggregateSpecs;

    if (
      !isPgConnectionAggregateFilter ||
      !pgIntrospection ||
      pgIntrospection.kind !== PgEntityKind.CLASS
    )
      return fields;
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
    } = build;
    const {
      scope: { isPgConnectionAggregateAggregateFilter },
    } = context;
    const spec: AggregateSpec | undefined =
      context.scope.pgConnectionAggregateFilterAggregateSpec;
    const pgIntrospection: PgEntity | undefined = context.scope.pgIntrospection;

    if (
      !isPgConnectionAggregateAggregateFilter ||
      !spec ||
      !pgIntrospection ||
      pgIntrospection.kind !== PgEntityKind.CLASS
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
        const OperatorsType = connectionFilterOperatorsType(
          newWithHooks,
          pgType.id,
          pgTypeModifier
        );
        const fieldName = inflection.column(attr);
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

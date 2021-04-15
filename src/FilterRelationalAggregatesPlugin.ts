import type { Plugin } from "graphile-build";
import type { ConnectionFilterResolver } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterPlugin";
import type { BackwardRelationSpec } from "postgraphile-plugin-connection-filter/dist/PgConnectionArgFilterBackwardRelationsPlugin";

const FilterRelationalAggregatesPlugin: Plugin = (builder) => {
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

      const sqlFragment = connectionFilterResolve(
        (fieldValue as any).filter,
        foreignTableAlias,
        foreignTableFilterTypeName,
        queryBuilder
      );
      const sqlConditions = [sql.fragment`sum(saves) > 9`];
      const sqlSelectWhereKeysMatch = sql.query`(select (${sql.join(
        sqlConditions,
        ") and ("
      )}) from (
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
};

export default FilterRelationalAggregatesPlugin;

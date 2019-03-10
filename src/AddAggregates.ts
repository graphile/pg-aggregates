import { Plugin } from "graphile-build";
import { PgAttribute, QueryBuilder } from "graphile-build-pg";
import { GraphQLEnumValueConfigMap, GraphQLResolveInfo } from "graphql";

const AddAggregatesPlugin: Plugin = builder => {
  // Hook all connections to add the aggregate field
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      pgSql: sql,
      newWithHooks,
      graphql: { GraphQLEnumType, GraphQLNonNull, GraphQLFloat },
      inflection,
      getSafeAliasFromAlias,
      getSafeAliasFromResolveInfo,
    } = build;
    const {
      fieldWithHooks,
      scope: { isPgRowConnectionType, pgIntrospection: table },
    } = context;

    // If it's not a table connection, abort
    if (
      !isPgRowConnectionType ||
      !table ||
      table.kind !== "class" ||
      !table.namespace
    ) {
      return fields;
    }

    // Figure out the columns that we're allowed to do a `SUM(...)` of
    const values = table.attributes.reduce(
      (
        memo: GraphQLEnumValueConfigMap,
        attr: PgAttribute
      ): GraphQLEnumValueConfigMap => {
        // Didn't use 'numeric' here because it'd be confusing with the 'NUMERIC' type.
        const attrIsNumberLike = attr.type.category === "N";
        if (attrIsNumberLike) {
          memo[inflection.column(attr)] = {
            value: {
              // Note this expression generator is just an sql fragment, so you
              // could add CASE statements, function calls, or whatever you need
              // here
              expressionGenerator: (queryBuilder: QueryBuilder) =>
                sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                  attr.name
                )}`,
            },
          };
        }
        return memo;
      },
      {}
    );

    // If there's no summable columns, don't add the aggregate
    if (!Object.keys(values).length) {
      return fields;
    }

    // Build the enum for the summable fields using the fields above (this is
    // hookable so you could add computed columns or other fields you want to
    // sum)
    const summableFieldsEnum = newWithHooks(
      GraphQLEnumType,
      {
        name: inflection.summableFieldEnum(table),
        values,
      },
      {
        pgIntrospection: table,
        isPgSummableFieldEnum: true,
      }
    );

    // Add our aggregate 'sum' field to the schema
    const fieldName = inflection.sumAggregate(table);
    return {
      ...fields,
      [fieldName]: fieldWithHooks(
        fieldName,
        ({ addDataGenerator }: any) => {
          addDataGenerator((parsedResolveInfoFragment: any) => {
            return {
              // This tells the query planner that we want to add an aggregate
              pgAggregateQuery: (aggregateQueryBuilder: QueryBuilder) => {
                const expr = parsedResolveInfoFragment.args.field.expressionGenerator(
                  aggregateQueryBuilder
                );
                aggregateQueryBuilder.select(
                  // You can put any aggregate expression here; I've wrapped it in `coalesce` so that it cannot be null
                  sql.fragment`coalesce(sum(${expr}), 0)`,
                  // We need a unique alias that we can later reference in the resolver
                  getSafeAliasFromAlias(parsedResolveInfoFragment.alias)
                );
              },
            };
          });
          return {
            description: `Sum`,
            args: {
              field: {
                type: new GraphQLNonNull(summableFieldsEnum),
              },
            },
            type: new GraphQLNonNull(GraphQLFloat),
            resolve(
              parent: any,
              _args: any,
              _context: any,
              resolveInfo: GraphQLResolveInfo
            ) {
              if (!parent.aggregates) {
                return 0; // This should never happen
              }
              // Figure out the unique alias we chose earlier
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              // All aggregates are stored into the 'aggregates' object, reference ours here
              return parent.aggregates[safeAlias];
            },
          };
        },
        {
          // In case anyone wants to hook us, describe ourselves
          isPgConnectionSumField: true,
        }
      ),
    };
  });
};
export default AddAggregatesPlugin;

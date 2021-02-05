import { PgClass, PgConstraint } from "graphile-build-pg";
import { makeAddInflectorsPlugin } from "graphile-utils";
import { AggregateSpec } from "./interfaces";

type Keys = Array<{
  column: string;
  table: string;
  schema?: string;
}>;

export default makeAddInflectorsPlugin({
  aggregateContainerType(table: PgClass) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-aggregates`
    );
  },
  aggregateType(table: PgClass, aggregateSpec: AggregateSpec) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-${aggregateSpec.id}-aggregates`
    );
  },
  aggregatesContainerField(_table: PgClass) {
    return "aggregates";
  },
  aggregatesField(_table: PgClass, aggregateSpec: AggregateSpec) {
    return aggregateSpec.id;
  },
  orderByCountOfManyRelationByKeys(
    detailedKeys: Keys,
    table: PgClass,
    foreignTable: PgClass,
    constraint: PgConstraint
  ) {
    const relationName = this.manyRelationByKeys(
      detailedKeys,
      table,
      foreignTable,
      constraint
    );
    return this.constantCase(`${relationName}-count`);
  },
});

import { PgClass } from "graphile-build-pg";
import { makeAddInflectorsPlugin } from "graphile-utils";
import { AggregateSpec } from "./interfaces";

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
});

import { PgClass } from "graphile-build-pg";
import { makeAddInflectorsPlugin } from "graphile-utils";

export default makeAddInflectorsPlugin({
  aggregateType(table: PgClass) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-aggregates`
    );
  },
  aggregateSumType(table: PgClass) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-sum-aggregates`
    );
  },
  aggregatesField(_table: PgClass) {
    return "aggregates";
  },
  aggregatesSumField(_table: PgClass) {
    return "sum";
  },
  summableFieldEnum(table: PgClass) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-summable-field-enum`
    );
  },
});

import { PgClass } from "graphile-build-pg";
import { makeAddInflectorsPlugin } from "graphile-utils";

export default makeAddInflectorsPlugin({
  sumAggregate() {
    return "sum";
  },
  summableFieldEnum(table: PgClass) {
    return this.upperCamelCase(
      `${this._singularizedTableName(table)}-summable-field-enum`
    );
  },
});

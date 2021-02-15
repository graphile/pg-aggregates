import type {
  PgAttribute,
  PgClass,
  PgConstraint,
  PgProc,
} from "graphile-build-pg";
import { makeAddInflectorsPlugin } from "graphile-utils";
import { AggregateGroupBySpec, AggregateSpec } from "./interfaces";

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
  groupedAggregatesContainerField(_table: PgClass) {
    return "groupedAggregates";
  },
  aggregatesField(aggregateSpec: AggregateSpec) {
    return aggregateSpec.id;
  },
  aggregateGroupByType(table: PgClass) {
    return this.upperCamelCase(`${this._tableName(table)}-group-by`);
  },
  aggregateGroupByColumnEnum(attr: PgAttribute) {
    return this.constantCase(`${this._columnName(attr)}`);
  },
  aggregateHavingInputType(table: PgClass) {
    return this.upperCamelCase(`${this._tableName(table)}-having-input`);
  },
  aggregateHavingAggregateInputType(
    table: PgClass,
    aggregateSpec: AggregateSpec
  ) {
    return this.upperCamelCase(
      `${this._tableName(table)}-having-${aggregateSpec.id}-input`
    );
  },
  aggregateHavingAggregateComputedColumnInputType(
    table: PgClass,
    aggregateSpec: AggregateSpec,
    proc: PgProc
  ) {
    return this.upperCamelCase(
      `${this._tableName(table)}-having-${aggregateSpec.id}-${proc.name}-input`
    );
  },
  aggregateHavingAggregateComputedColumnArgsInputType(
    table: PgClass,
    aggregateSpec: AggregateSpec,
    proc: PgProc
  ) {
    return this.upperCamelCase(
      `${this._tableName(table)}-having-${aggregateSpec.id}-${
        proc.name
      }-args-input`
    );
  },
  aggregateGroupByColumnDerivativeEnum(
    attr: PgAttribute,
    spec: AggregateGroupBySpec
  ) {
    return this.constantCase(`${this._columnName(attr)}-${spec.id}`);
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
  orderByColumnAggregateOfManyRelationByKeys(
    detailedKeys: Keys,
    table: PgClass,
    foreignTable: PgClass,
    constraint: PgConstraint,
    aggregateSpec: AggregateSpec,
    column: PgAttribute
  ) {
    const relationName = this.manyRelationByKeys(
      detailedKeys,
      table,
      foreignTable,
      constraint
    );
    return this.constantCase(
      `${relationName}-${aggregateSpec.id}-${this._columnName(column)}`
    );
  },
});

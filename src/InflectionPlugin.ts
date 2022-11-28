import type {} from "graphile-config";
import type {} from "graphile-build";
import type {} from "graphile-build-pg";
import {
  PgSource,
  PgSourceRelation,
  PgTypeCodec,
  PgTypeColumn,
} from "@dataplan/pg";
import { AggregateGroupBySpec, AggregateSpec } from "./interfaces";

const { version } = require("../package.json");

type Keys = Array<{
  column: string;
  table: string;
  schema?: string;
}>;

declare global {
  namespace GraphileBuild {
    interface Inflection {
      aggregateContainerType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
        }
      ): string;
      aggregateType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          aggregateSpec: AggregateSpec;
        }
      ): string;
      aggregatesContainerField(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
        }
      ): string;
      groupedAggregatesContainerField(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
        }
      ): string;
      aggregatesField(
        this: Inflection,
        details: {
          aggregateSpec: AggregateSpec;
        }
      ): string;
      aggregateGroupByType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
        }
      ): string;
      aggregateGroupByColumnEnum(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          columnName: string;
        }
      ): string;
      aggregateHavingInputType(
        this: Inflection,
        details: { source: PgSource<any, any, any, any> }
      ): string;
      aggregateHavingAggregateInputType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          aggregateSpec: AggregateSpec;
        }
      ): string;
      aggregateHavingAggregateComputedColumnInputType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          aggregateSpec: AggregateSpec;
          computedColumnSource: PgSource<any, any, any, any>;
        }
      ): string;
      aggregateHavingAggregateComputedColumnArgsInputType(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          aggregateSpec: AggregateSpec;
          computedColumnSource: PgSource<any, any, any, any>;
        }
      ): string;
      aggregateGroupByColumnDerivativeEnum(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          columnName: string;
          spec: AggregateGroupBySpec;
        }
      ): string;
      orderByCountOfManyRelationByKeys(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          relationName: string;
        }
      ): string;
      orderByColumnAggregateOfManyRelationByKeys(
        this: Inflection,
        details: {
          source: PgSource<any, any, any, any>;
          relationName: string;
          aggregateSpec: AggregateSpec;
          columnName: string;
        }
      ): string;
    }
  }
}

export const PgAggregatesInflectorsPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesInflectorsPlugin",
  version,

  inflection: {
    add: {
      aggregateContainerType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-aggregates`
        );
      },
      aggregateType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-${
            details.aggregateSpec.id
          }-aggregates`
        );
      },
      aggregatesContainerField(preset, details) {
        return "aggregates";
      },
      groupedAggregatesContainerField(preset, details) {
        return "groupedAggregates";
      },
      aggregatesField(preset, details) {
        return details.aggregateSpec.id;
      },
      aggregateGroupByType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-group-by`
        );
      },
      aggregateGroupByColumnEnum(preset, details) {
        return this.constantCase(
          `${this._columnName({
            columnName: details.columnName,
            codec: details.source.codec,
          })}`
        );
      },
      aggregateHavingInputType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-input`
        );
      },
      aggregateHavingAggregateInputType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-input`
        );
      },
      aggregateHavingAggregateComputedColumnInputType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-${this._sourceName(details.computedColumnSource)}-input`
        );
      },
      aggregateHavingAggregateComputedColumnArgsInputType(preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-${this._sourceName(details.computedColumnSource)}-args-input`
        );
      },
      aggregateGroupByColumnDerivativeEnum(preset, details) {
        return this.constantCase(
          `${this._columnName({
            columnName: details.columnName,
            codec: details.source.codec,
          })}-${details.spec.id}`
        );
      },
      orderByCountOfManyRelationByKeys(preset, details) {
        const relationName = this._manyRelation(details);
        return this.constantCase(`${relationName}-count`);
      },
      orderByColumnAggregateOfManyRelationByKeys(preset, details) {
        const relationName = this._manyRelation(details);
        const relation: PgSourceRelation<any, any> = details.source.getRelation(
          details.relationName
        );
        return this.constantCase(
          `${relationName}-${details.aggregateSpec.id}-${this._columnName({
            codec: relation.source.codec,
            columnName: details.columnName,
          })}`
        );
      },
    },
  },
};

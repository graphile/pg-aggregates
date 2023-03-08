import type {} from "graphile-config";
import type {} from "graphile-build";
import type {} from "graphile-build-pg";
import { PgSource, PgSourceRelation } from "@dataplan/pg";
import {
  AggregateGroupBySpec,
  AggregateSpec,
  CORE_HAVING_FILTER_SPECS,
} from "./interfaces";

const { version } = require("../package.json");

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
          aggregateGroupBySpec: AggregateGroupBySpec;
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

      aggregateHavingFilterInputType(
        this: Inflection,
        spec: (typeof CORE_HAVING_FILTER_SPECS)[number]
      ): string;
    }
  }
}

export const PgAggregatesInflectorsPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesInflectorsPlugin",
  version,
  provides: ["aggregates"],

  inflection: {
    add: {
      aggregateContainerType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-aggregates`
        );
      },
      aggregateType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-${
            details.aggregateSpec.id
          }-aggregates`
        );
      },
      aggregatesContainerField(_preset, _details) {
        return "aggregates";
      },
      groupedAggregatesContainerField(_preset, _details) {
        return "groupedAggregates";
      },
      aggregatesField(_preset, details) {
        return details.aggregateSpec.id;
      },
      aggregateGroupByType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-group-by`
        );
      },
      aggregateGroupByColumnEnum(_preset, details) {
        return this.constantCase(
          `${this._columnName({
            columnName: details.columnName,
            codec: details.source.codec,
          })}`
        );
      },
      aggregateHavingInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-input`
        );
      },
      aggregateHavingAggregateInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-input`
        );
      },
      aggregateHavingAggregateComputedColumnInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-${this._sourceName(details.computedColumnSource)}-input`
        );
      },
      aggregateHavingAggregateComputedColumnArgsInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.source.codec)}-having-${
            details.aggregateSpec.id
          }-${this._sourceName(details.computedColumnSource)}-args-input`
        );
      },
      aggregateGroupByColumnDerivativeEnum(_preset, details) {
        return this.constantCase(
          `${this._columnName({
            columnName: details.columnName,
            codec: details.source.codec,
          })}-${details.aggregateGroupBySpec.id}`
        );
      },
      orderByCountOfManyRelationByKeys(_preset, details) {
        const relationName = this._manyRelation(details);
        return this.constantCase(`${relationName}-count`);
      },
      orderByColumnAggregateOfManyRelationByKeys(_preset, details) {
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
      aggregateHavingFilterInputType(_preset, spec) {
        return this.upperCamelCase(`having-${spec}-filter`);
      },
    },
  },
};

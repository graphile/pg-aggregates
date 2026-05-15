import type {
  PgCodecRelation,
  PgCodecWithAttributes,
  PgRegistry,
  PgResource,
} from "@dataplan/pg";
import type {} from "graphile-build";
import type {} from "graphile-build-pg";
import type {} from "graphile-config";

import type {
  AggregateGroupBySpec,
  AggregateSpec,
  CORE_HAVING_FILTER_SPECS,
} from "./interfaces.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface Inflection {
      aggregateContainerType(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
        }
      ): string;
      aggregateType(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          aggregateSpec: AggregateSpec;
        }
      ): string;
      aggregatesContainerField(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
        }
      ): string;
      groupedAggregatesContainerField(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
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
          resource: PgResource<any, any, any, any, any>;
        }
      ): string;
      aggregateGroupByAttributeEnum(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          attributeName: string;
        }
      ): string;
      aggregateHavingInputType(
        this: Inflection,
        details: { resource: PgResource<any, any, any, any, any> }
      ): string;
      aggregateHavingAggregateInputType(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          aggregateSpec: AggregateSpec;
        }
      ): string;
      aggregateHavingAggregateComputedAttributeInputType(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          aggregateSpec: AggregateSpec;
          computedAttributeResource: PgResource<any, any, any, any, any>;
        }
      ): string;
      aggregateHavingAggregateComputedAttributeArgsInputType(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          aggregateSpec: AggregateSpec;
          computedAttributeResource: PgResource<any, any, any, any, any>;
        }
      ): string;
      aggregateGroupByAttributeDerivativeEnum(
        this: Inflection,
        details: {
          resource: PgResource<any, any, any, any, any>;
          attributeName: string;
          aggregateGroupBySpec: AggregateGroupBySpec;
        }
      ): string;
      orderByCountOfManyRelationByKeys(
        this: Inflection,
        details: {
          registry: PgRegistry;
          codec: PgCodecWithAttributes;
          relationName: string;
        }
      ): string;
      orderByAttributeAggregateOfManyRelationByKeys(
        this: Inflection,
        details: {
          registry: PgRegistry;
          codec: PgCodecWithAttributes;
          relationName: string;
          aggregateSpec: AggregateSpec;
          attributeName: string;
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
  description: "Adds the inflectors used by the pg-aggregates preset.",
  version,
  provides: ["aggregates"],

  inflection: {
    add: {
      aggregateContainerType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-aggregates`
        );
      },
      aggregateType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-${
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
          `${this._singularizedCodecName(details.resource.codec)}-group-by`
        );
      },
      aggregateGroupByAttributeEnum(_preset, details) {
        return this.constantCase(
          `${this._attributeName({
            attributeName: details.attributeName,
            codec: details.resource.codec,
          })}`
        );
      },
      aggregateHavingInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-having-input`
        );
      },
      aggregateHavingAggregateInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-having-${
            details.aggregateSpec.id
          }-input`
        );
      },
      aggregateHavingAggregateComputedAttributeInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-having-${
            details.aggregateSpec.id
          }-${this._resourceName(details.computedAttributeResource)}-input`
        );
      },
      aggregateHavingAggregateComputedAttributeArgsInputType(_preset, details) {
        return this.upperCamelCase(
          `${this._singularizedCodecName(details.resource.codec)}-having-${
            details.aggregateSpec.id
          }-${this._resourceName(details.computedAttributeResource)}-args-input`
        );
      },
      aggregateGroupByAttributeDerivativeEnum(_preset, details) {
        return this.constantCase(
          `${this._attributeName({
            attributeName: details.attributeName,
            codec: details.resource.codec,
          })}-${details.aggregateGroupBySpec.id}`
        );
      },
      orderByCountOfManyRelationByKeys(_preset, details) {
        const relationName = this._manyRelation(details);
        return this.constantCase(`${relationName}-count`);
      },
      orderByAttributeAggregateOfManyRelationByKeys(_preset, details) {
        const relationName = this._manyRelation(details);
        const relation = details.registry.pgRelations[details.codec.name][
          details.relationName
        ] as PgCodecRelation<any, any>;
        return this.constantCase(
          `${relationName}-${details.aggregateSpec.id}-${this._attributeName({
            codec: relation.remoteResource.codec,
            attributeName: details.attributeName,
          })}`
        );
      },
      aggregateHavingFilterInputType(_preset, spec) {
        return this.upperCamelCase(`having-${spec}-filter`);
      },
    },
  },
};

import type { PgCodec } from "@dataplan/pg";
import {
  AggregateSpec,
  AggregateGroupBySpec,
  BIGINT_OID,
  INT2_OID,
  INT4_OID,
  NUMERIC_OID,
  FLOAT4_OID,
  FLOAT8_OID,
  INTERVAL_OID,
  MONEY_OID,
} from "./interfaces.js";

const { version } = require("../package.json");

const isNumberLike = (codec: PgCodec<any, any, any, any>): boolean =>
  !!codec.extensions?.isNumberLike;

export const PgAggregatesSpecsPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesSpecsPlugin",
  version,
  provides: ["aggregates"],
  after: ["PgBasicsPlugin"],

  gather: {
    hooks: {
      pgCodecs_PgCodec(_info, event) {
        const { pgType, pgCodec } = event;
        if (pgType.typcategory === "N") {
          if (!pgCodec.extensions) {
            pgCodec.extensions = Object.create(null);
          }
          pgCodec.extensions!.isNumberLike = true;
        }
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        if (!build.dataplanPg || !build.sql) {
          throw new Error(`PgBasicsPlugin must be loaded first`);
        }
        const {
          sql,
          dataplanPg: { TYPES },
        } = build;

        /** Maps from the data type of the attribute to the data type of the sum aggregate */
        /** BigFloat is our fallback type; it should be valid for almost all numeric types */
        const convertWithMapAndFallback = (
          dataTypeToAggregateTypeMap: {
            [key: string]: PgCodec<any, any, any, any>;
          },
          fallback: PgCodec<any, any, any, any>
        ) => {
          return (
            codec: PgCodec<any, any, any, any>
          ): PgCodec<any, any, any, any> => {
            const oid = codec.extensions?.oid;
            const targetType =
              (oid ? dataTypeToAggregateTypeMap[oid] : null) ?? fallback;

            return targetType;
          };
        };

        const pgAggregateSpecs: AggregateSpec[] = [
          {
            id: "sum",
            humanLabel: "sum",
            HumanLabel: "Sum",
            isSuitableType: isNumberLike,
            // I've wrapped it in `coalesce` so that it cannot be null
            sqlAggregateWrap: (sqlFrag) => sql`coalesce(sum(${sqlFrag}), 0)`,
            isNonNull: true,

            // A SUM(...) often ends up significantly larger than any individual
            // value; see
            // https://www.postgresql.org/docs/current/functions-aggregate.html for
            // how the sum aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                // TODO: this should use codecs rather than OIDs
                [INT2_OID]: TYPES.bigint, // smallint -> bigint
                [INT4_OID]: TYPES.bigint, // integer -> bigint
                [BIGINT_OID]: TYPES.numeric, // bigint -> numeric
                [FLOAT4_OID]: TYPES.float4, // real -> real
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
                [INTERVAL_OID]: TYPES.interval, // interval -> interval
                [MONEY_OID]: TYPES.money, // money -> money
              },
              TYPES.numeric /* numeric */
            ),
          },
          {
            id: "distinctCount",
            humanLabel: "distinct count",
            HumanLabel: "Distinct count",
            isSuitableType: () => true,
            sqlAggregateWrap: (sqlFrag) => sql`count(distinct ${sqlFrag})`,
            pgTypeCodecModifier: convertWithMapAndFallback(
              {},
              TYPES.bigint /* always use bigint */
            ),
          },
          {
            id: "min",
            humanLabel: "minimum",
            HumanLabel: "Minimum",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`min(${sqlFrag})`,
          },
          {
            id: "max",
            humanLabel: "maximum",
            HumanLabel: "Maximum",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`max(${sqlFrag})`,
          },
          {
            id: "average",
            humanLabel: "mean average",
            HumanLabel: "Mean average",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`avg(${sqlFrag})`,

            // An AVG(...) ends up more precise than any individual value; see
            // https://www.postgresql.org/docs/current/functions-aggregate.html for
            // how the avg aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                [INT2_OID]: TYPES.numeric, // smallint -> numeric
                [INT4_OID]: TYPES.numeric, // integer -> numeric
                [BIGINT_OID]: TYPES.numeric, // bigint -> numeric
                [NUMERIC_OID]: TYPES.numeric, // numeric -> numeric
                [FLOAT4_OID]: TYPES.float, // real -> double precision
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
                [INTERVAL_OID]: TYPES.interval, // interval -> interval
              },
              TYPES.numeric /* numeric */
            ),
          },
          {
            id: "stddevSample",
            humanLabel: "sample standard deviation",
            HumanLabel: "Sample standard deviation",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`stddev_samp(${sqlFrag})`,

            // See https://www.postgresql.org/docs/current/functions-aggregate.html
            // for how this aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                [FLOAT4_OID]: TYPES.float, // real -> double precision
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
              },
              TYPES.numeric /* numeric */
            ),
          },
          {
            id: "stddevPopulation",
            humanLabel: "population standard deviation",
            HumanLabel: "Population standard deviation",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`stddev_pop(${sqlFrag})`,

            // See https://www.postgresql.org/docs/current/functions-aggregate.html
            // for how this aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                [FLOAT4_OID]: TYPES.float, // real -> double precision
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
              },
              TYPES.numeric /* numeric */
            ),
          },
          {
            id: "varianceSample",
            humanLabel: "sample variance",
            HumanLabel: "Sample variance",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`var_samp(${sqlFrag})`,

            // See https://www.postgresql.org/docs/current/functions-aggregate.html
            // for how this aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                [FLOAT4_OID]: TYPES.float, // real -> double precision
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
              },
              TYPES.numeric /* numeric */
            ),
          },
          {
            id: "variancePopulation",
            humanLabel: "population variance",
            HumanLabel: "Population variance",
            isSuitableType: isNumberLike,
            sqlAggregateWrap: (sqlFrag) => sql`var_pop(${sqlFrag})`,

            // See https://www.postgresql.org/docs/current/functions-aggregate.html
            // for how this aggregate changes result type.
            pgTypeCodecModifier: convertWithMapAndFallback(
              {
                [FLOAT4_OID]: TYPES.float, // real -> double precision
                [FLOAT8_OID]: TYPES.float, // double precision -> double precision
              },
              TYPES.numeric /* numeric */
            ),
          },
        ];

        const pgAggregateGroupBySpecs: AggregateGroupBySpec[] = [
          {
            id: "truncated-to-hour",
            isSuitableType: (codec) =>
              codec === TYPES.timestamp || codec === TYPES.timestamptz,
            sqlWrap: (sqlFrag) => sql`date_trunc('hour', ${sqlFrag})`,
          },
          {
            id: "truncated-to-day",
            isSuitableType: (codec) =>
              codec === TYPES.timestamp || codec === TYPES.timestamptz,
            sqlWrap: (sqlFrag) => sql`date_trunc('day', ${sqlFrag})`,
          },
        ];

        return build.extend(
          build,
          {
            pgAggregateSpecs,
            pgAggregateGroupBySpecs,
          },
          "Adding aggregate specs to build"
        );
      },
    },
  },
};

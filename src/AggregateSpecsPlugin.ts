import type { PgCodec } from "@dataplan/pg";

import { EXPORTABLE } from "./EXPORTABLE.js";
import type { AggregateGroupBySpec, AggregateSpec } from "./interfaces.js";
import {
  BIGINT_OID,
  FLOAT4_OID,
  FLOAT8_OID,
  INT2_OID,
  INT4_OID,
  INTERVAL_OID,
  MONEY_OID,
  NUMERIC_OID,
} from "./interfaces.js";

const { version } = require("../package.json");

const isNumberLike = (codec: PgCodec<any, any, any, any>): boolean =>
  !!codec.extensions?.isNumberLike;
const isIntervalLike = (codec: PgCodec<any, any, any, any>): boolean =>
  !!codec.extensions?.isIntervalLike;

const isIntervalLikeOrNumberLike = EXPORTABLE(
  (isIntervalLike, isNumberLike) =>
    (codec: PgCodec<any, any, any, any>): boolean =>
      isIntervalLike(codec) || isNumberLike(codec),
  [isIntervalLike, isNumberLike]
);

export const PgAggregatesSpecsPlugin: GraphileConfig.Plugin = {
  name: "PgAggregatesSpecsPlugin",
  version,
  provides: ["aggregates"],
  after: ["PgBasicsPlugin"],

  gather: {
    hooks: {
      pgCodecs_PgCodec(_info, event) {
        const { pgType, pgCodec } = event;
        const isReg =
          pgType.getNamespace()?.nspname === "pg_catalog" &&
          pgType.typname.startsWith("reg");
        const isCatN = !isReg && pgType.typcategory === "N";
        const isInterval = !isReg && pgType._id === INTERVAL_OID;
        if (isCatN || isInterval) {
          if (!pgCodec.extensions) {
            pgCodec.extensions = Object.create(null);
          }
        }
        if (isCatN) {
          pgCodec.extensions!.isNumberLike = true;
        }
        if (isInterval) {
          pgCodec.extensions!.isIntervalLike = true;
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
          EXPORTABLE,
        } = build;

        /** Maps from the data type of the attribute to the data type of the sum aggregate */
        /** BigFloat is our fallback type; it should be valid for almost all numeric types */
        const convertWithMapAndFallback = (
          dataTypeToAggregateTypeMap: {
            [key: string]: PgCodec<any, any, any, any>;
          },
          fallback: PgCodec<any, any, any, any>
        ) => {
          return EXPORTABLE(
            (dataTypeToAggregateTypeMap, fallback) =>
              (
                codec: PgCodec<any, any, any, any>
              ): PgCodec<any, any, any, any> => {
                const oid = codec.extensions?.oid;
                const targetType =
                  (oid ? dataTypeToAggregateTypeMap[oid] : null) ?? fallback;

                return targetType;
              },
            [dataTypeToAggregateTypeMap, fallback]
          );
        };

        const pgAggregateSpecs: AggregateSpec[] = [
          {
            id: "sum",
            humanLabel: "sum",
            HumanLabel: "Sum",
            isSuitableType: isIntervalLikeOrNumberLike,
            // I've wrapped it in `coalesce` so that it cannot be null
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`coalesce(sum(${sqlFrag}), '0')`,
              [sql]
            ),
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
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`count(distinct ${sqlFrag})`,
              [sql]
            ),
            pgTypeCodecModifier: convertWithMapAndFallback(
              {},
              TYPES.bigint /* always use bigint */
            ),
          },
          {
            id: "min",
            humanLabel: "minimum",
            HumanLabel: "Minimum",
            isSuitableType: isIntervalLikeOrNumberLike,
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`min(${sqlFrag})`,
              [sql]
            ),
          },
          {
            id: "max",
            humanLabel: "maximum",
            HumanLabel: "Maximum",
            isSuitableType: isIntervalLikeOrNumberLike,
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`max(${sqlFrag})`,
              [sql]
            ),
          },
          {
            id: "average",
            humanLabel: "mean average",
            HumanLabel: "Mean average",
            isSuitableType: isIntervalLikeOrNumberLike,
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`avg(${sqlFrag})`,
              [sql]
            ),

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
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`stddev_samp(${sqlFrag})`,
              [sql]
            ),

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
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`stddev_pop(${sqlFrag})`,
              [sql]
            ),

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
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`var_samp(${sqlFrag})`,
              [sql]
            ),

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
            sqlAggregateWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`var_pop(${sqlFrag})`,
              [sql]
            ),

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
            isSuitableType: EXPORTABLE(
              (TYPES) => (codec) =>
                codec === TYPES.timestamp || codec === TYPES.timestamptz,
              [TYPES]
            ),
            sqlWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`date_trunc('hour', ${sqlFrag})`,
              [sql]
            ),
          },
          {
            id: "truncated-to-day",
            isSuitableType: EXPORTABLE(
              (TYPES) => (codec) =>
                codec === TYPES.timestamp || codec === TYPES.timestamptz,
              [TYPES]
            ),
            sqlWrap: EXPORTABLE(
              (sql) => (sqlFrag) => sql`date_trunc('day', ${sqlFrag})`,
              [sql]
            ),
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

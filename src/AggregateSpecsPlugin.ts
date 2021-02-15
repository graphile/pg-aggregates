import type { Plugin } from "graphile-build";
import type { PgType } from "graphile-build-pg";
import { AggregateSpec, AggregateGroupBySpec } from "./interfaces";

const TIMESTAMP_OID = "1114";
const TIMESTAMPTZ_OID = "1184";

const SMALLINT_OID = "21";
const BIGINT_OID = "20";
const INTEGER_OID = "23";
const NUMERIC_OID = "1700";
const REAL_OID = "700";
const DOUBLE_PRECISION_OID = "701";
const INTERVAL_OID = "1186";
const MONEY_OID = "790";

const AggregateSpecsPlugin: Plugin = (builder) => {
  builder.hook("build", (build) => {
    const { pgSql: sql } = build;
    const isNumberLike = (pgType: PgType): boolean => pgType.category === "N";
    /** Maps from the data type of the column to the data type of the sum aggregate */
    /** BigFloat is our fallback type; it should be valid for almost all numeric types */
    const convertWithMapAndFallback = (
      dataTypeToAggregateTypeMap: { [key: string]: string },
      fallback: string
    ) => {
      return (
        pgType: PgType,
        _pgTypeModifier: number | string | null
      ): [PgType, null | number | string] => {
        const targetTypeId = dataTypeToAggregateTypeMap[pgType.id] || fallback;

        const targetType = build.pgIntrospectionResultsByKind.type.find(
          (t: PgType) => t.id === targetTypeId
        );

        if (!targetType) {
          throw new Error(
            `Could not find PostgreSQL type with oid '${targetTypeId}' whilst processing aggregate.`
          );
        }

        return [targetType, null];
      };
    };
    const pgAggregateSpecs: AggregateSpec[] = [
      {
        id: "sum",
        humanLabel: "sum",
        HumanLabel: "Sum",
        isSuitableType: isNumberLike,
        // I've wrapped it in `coalesce` so that it cannot be null
        sqlAggregateWrap: (sqlFrag) =>
          sql.fragment`coalesce(sum(${sqlFrag}), 0)`,
        isNonNull: true,

        // A SUM(...) often ends up significantly larger than any individual
        // value; see
        // https://www.postgresql.org/docs/current/functions-aggregate.html for
        // how the sum aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [SMALLINT_OID]: BIGINT_OID, // smallint -> bigint
            [INTEGER_OID]: BIGINT_OID, // integer -> bigint
            [BIGINT_OID]: NUMERIC_OID, // bigint -> numeric
            [REAL_OID]: REAL_OID, // real -> real
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
            [INTERVAL_OID]: INTERVAL_OID, // interval -> interval
            [MONEY_OID]: MONEY_OID, // money -> money
          },
          NUMERIC_OID /* numeric */
        ),
      },
      {
        id: "distinctCount",
        humanLabel: "distinct count",
        HumanLabel: "Distinct count",
        isSuitableType: () => true,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`count(distinct ${sqlFrag})`,
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {},
          BIGINT_OID /* always use bigint */
        ),
      },
      {
        id: "min",
        humanLabel: "minimum",
        HumanLabel: "Minimum",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`min(${sqlFrag})`,
      },
      {
        id: "max",
        humanLabel: "maximum",
        HumanLabel: "Maximum",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`max(${sqlFrag})`,
      },
      {
        id: "average",
        humanLabel: "mean average",
        HumanLabel: "Mean average",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`avg(${sqlFrag})`,

        // An AVG(...) ends up more precise than any individual value; see
        // https://www.postgresql.org/docs/current/functions-aggregate.html for
        // how the avg aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [SMALLINT_OID]: NUMERIC_OID, // smallint -> numeric
            [INTEGER_OID]: NUMERIC_OID, // integer -> numeric
            [BIGINT_OID]: NUMERIC_OID, // bigint -> numeric
            [NUMERIC_OID]: NUMERIC_OID, // numeric -> numeric
            [REAL_OID]: DOUBLE_PRECISION_OID, // real -> double precision
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
            [INTERVAL_OID]: INTERVAL_OID, // interval -> interval
          },
          "1700" /* numeric */
        ),
      },
      {
        id: "stddevSample",
        humanLabel: "sample standard deviation",
        HumanLabel: "Sample standard deviation",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`stddev_samp(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [REAL_OID]: DOUBLE_PRECISION_OID, // real -> double precision
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
          },
          NUMERIC_OID /* numeric */
        ),
      },
      {
        id: "stddevPopulation",
        humanLabel: "population standard deviation",
        HumanLabel: "Population standard deviation",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`stddev_pop(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [REAL_OID]: DOUBLE_PRECISION_OID, // real -> double precision
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
          },
          NUMERIC_OID /* numeric */
        ),
      },
      {
        id: "varianceSample",
        humanLabel: "sample variance",
        HumanLabel: "Sample variance",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`var_samp(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [REAL_OID]: DOUBLE_PRECISION_OID, // real -> double precision
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
          },
          NUMERIC_OID /* numeric */
        ),
      },
      {
        id: "variancePopulation",
        humanLabel: "population variance",
        HumanLabel: "Population variance",
        isSuitableType: isNumberLike,
        sqlAggregateWrap: (sqlFrag) => sql.fragment`var_pop(${sqlFrag})`,

        // See https://www.postgresql.org/docs/current/functions-aggregate.html
        // for how this aggregate changes result type.
        pgTypeAndModifierModifier: convertWithMapAndFallback(
          {
            [REAL_OID]: DOUBLE_PRECISION_OID, // real -> double precision
            [DOUBLE_PRECISION_OID]: DOUBLE_PRECISION_OID, // double precision -> double precision
          },
          NUMERIC_OID /* numeric */
        ),
      },
    ];

    const pgAggregateGroupBySpecs: AggregateGroupBySpec[] = [
      {
        id: "truncated-to-hour",
        isSuitableType: (pgType) =>
          /* timestamp or timestamptz */
          pgType.id === TIMESTAMP_OID || pgType.id === TIMESTAMPTZ_OID,
        sqlWrap: (sqlFrag) => sql.fragment`date_trunc('hour', ${sqlFrag})`,
      },
      {
        id: "truncated-to-day",
        isSuitableType: (pgType) =>
          /* timestamp or timestamptz */
          pgType.id === TIMESTAMP_OID || pgType.id === TIMESTAMPTZ_OID,
        sqlWrap: (sqlFrag) => sql.fragment`date_trunc('day', ${sqlFrag})`,
      },
    ];

    return build.extend(build, {
      pgAggregateSpecs,
      pgAggregateGroupBySpecs,
    });
  });
};

export default AggregateSpecsPlugin;

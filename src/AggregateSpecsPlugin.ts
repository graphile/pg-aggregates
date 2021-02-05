import { Plugin } from "graphile-build";
import { PgType } from "graphile-build-pg";
import { AggregateSpec } from "./interfaces";

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
            21: "20", // smallint -> bigint
            23: "20", // integer -> bigint
            20: "1700", // bigint -> numeric
            700: "700", // real -> real
            701: "701", // double precision -> double precision
            1186: "1186", // interval -> interval
            790: "790", // money -> money
          },
          "1700" /* numeric */
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
          "20" /* always use bigint */
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
            21: "1700", // smallint -> numeric
            23: "1700", // integer -> numeric
            20: "1700", // bigint -> numeric
            1700: "1700", // numeric -> numeric
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
            1186: "1186", // interval -> interval
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
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
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
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
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
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
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
            700: "701", // real -> double precision
            701: "701", // double precision -> double precision
          },
          "1700" /* numeric */
        ),
      },
    ];
    return build.extend(build, {
      pgAggregateSpecs,
    });
  });
};

export default AggregateSpecsPlugin;

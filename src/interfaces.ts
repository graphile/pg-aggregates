import type { PgAttribute, PgType, SQL, PgProc } from "graphile-build-pg";

export interface AggregateGroupBySpec {
  /** Must not change since it's used in type names/etc */
  id: string; // e.g. 'truncated-to-hour'

  /** Return true if we can process this type */
  isSuitableType: (type: PgType) => boolean;

  /** Return false if we cannot process this attribute (default: true) */
  shouldApplyToEntity?: (entity: PgAttribute | PgProc) => boolean;

  /** Wraps the SQL to return a derivative (e.g. sqlFrag => sql.fragment`date_trunc('hour', ${sqlFrag})`) */
  sqlWrap: (sqlFrag: SQL) => SQL;
}

export interface AggregateSpec {
  /** Must not change since it's used in type names/etc */
  id: string;

  /** Used in descriptions, starts with lowercase */
  humanLabel: string;

  /** Used in descriptions, starts with uppercase */
  HumanLabel: string;

  /** Return true if we can process this type */
  isSuitableType: (type: PgType) => boolean;

  /** Return false if we cannot process this attribute (default: true) */
  shouldApplyToEntity?: (entity: PgAttribute | PgProc) => boolean;

  /** Wraps the SQL in an aggregate call */
  sqlAggregateWrap: (sqlFrag: SQL) => SQL;

  /**
   * Used to translate the PostgreSQL return type for the aggregate; for example:
   *
   * - Sum over int should give bigint
   * - Average of int should be float
   * - Median of int should be int
   */
  pgTypeAndModifierModifier?: (
    pgType: PgType,
    pgTypeModifier: null | string | number
  ) => [PgType, null | string | number];

  /** Set true if the result is guaranteed to be non-null */
  isNonNull?: boolean;
}

export const BIGINT_OID = "20";
export const INT2_OID = "21";
export const INT4_OID = "23";
export const FLOAT4_OID = "700";
export const FLOAT8_OID = "701";
export const NUMERIC_OID = "1700";
export const MONEY_OID = "790";
export const INTERVAL_OID = "1186";
export const DATE_OID = "1082";
export const TIMESTAMP_OID = "1114";
export const TIMESTAMPTZ_OID = "1184";
export const TIME_OID = "1083";
export const TIMETZ_OID = "1266";
export const JSON_OID = "114";
export const JSONB_OID = "3802";
export const UUID_OID = "2950";
export const BIT_OID = "1560";
export const VARBIT_OID = "1562";
export const CHAR_OID = "18";
export const TEXT_OID = "25";
export const VARCHAR_OID = "1043";
export const POINT_OID = "600";
export const INET_OID = "869";
export const CIDR_OID = "650";
export const MAC_ADDR_OID = "829";
export const MAC_ADDR8_OID = "774";
export const REG_PROC_OID = "24";
export const REG_PROCEDURE_OID = "2202";
export const REG_OPER_OID = "2203";
export const REG_OPERATOR_OID = "2204";
export const REG_CLASS_OID = "2205";
export const REG_OID = "2206";
export const REG_ROLE_OID = "4096";
export const REG_NAMESPACE_OID = "4089";
export const REG_CONFIG_OID = "3734";
export const REG_DICTIONARY_OID = "3769";

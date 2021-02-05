import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AggregateSpecsPlugin from "./AggregateSpecsPlugin";
import AddGroupByAggregateEnumsPlugin from "./AddGroupByAggregateEnumsPlugin";
import AddGroupByAggregateEnumValuesForColumnsPlugin from "./AddGroupByAggregateEnumValuesForColumnsPlugin";
import AddAggregatesPlugin from "./AddAggregatesPlugin";
import OrderByAggregatesPlugin from "./OrderByAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AggregateSpecsPlugin,
  AddGroupByAggregateEnumsPlugin,
  AddGroupByAggregateEnumValuesForColumnsPlugin,
  AddAggregatesPlugin,
  OrderByAggregatesPlugin
);

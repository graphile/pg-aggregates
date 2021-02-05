import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AggregateSpecsPlugin from "./AggregateSpecsPlugin";
import AddAggregatesPlugin from "./AddAggregatesPlugin";
import OrderByAggregatesPlugin from "./OrderByAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AggregateSpecsPlugin,
  AddAggregatesPlugin,
  OrderByAggregatesPlugin
);

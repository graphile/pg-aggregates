import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AddAggregatesPlugin from "./AddAggregatesPlugin";
import OrderByAggregatesPlugin from "./OrderByAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AddAggregatesPlugin,
  OrderByAggregatesPlugin
);

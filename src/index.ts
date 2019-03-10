import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AddAggregatesPlugin from "./AddAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AddAggregatesPlugin
);

import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";
import AggregateSpecsPlugin from "./AggregateSpecsPlugin";
import AddGroupByAggregateEnumsPlugin from "./AddGroupByAggregateEnumsPlugin";
import AddGroupByAggregateEnumValuesForColumnsPlugin from "./AddGroupByAggregateEnumValuesForColumnsPlugin";
import AddAggregateTypesPlugin from "./AddAggregateTypesPlugin";
import AddConnectionAggregatesPlugin from "./AddConnectionAggregatesPlugin";
import AddConnectionGroupedAggregatesPlugin from "./AddConnectionGroupedAggregatesPlugin";
import OrderByAggregatesPlugin from "./OrderByAggregatesPlugin";

export default makePluginByCombiningPlugins(
  InflectionPlugin,
  AggregateSpecsPlugin,
  AddGroupByAggregateEnumsPlugin,
  AddGroupByAggregateEnumValuesForColumnsPlugin,
  AddAggregateTypesPlugin,
  AddConnectionAggregatesPlugin,
  AddConnectionGroupedAggregatesPlugin,
  OrderByAggregatesPlugin
);

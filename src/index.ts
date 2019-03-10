import { makePluginByCombiningPlugins } from "graphile-utils";
import InflectionPlugin from "./InflectionPlugin";

export default makePluginByCombiningPlugins(InflectionPlugin);

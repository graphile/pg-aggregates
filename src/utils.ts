import { PgResource, PgResourceParameter } from "@dataplan/pg";
import { GraphileBuild } from "graphile-build";
import type {} from "graphile-build-pg";

export function getComputedAttributeResources(
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any>
) {
  const computedAttributeResources = Object.values(
    build.input.pgRegistry.pgResources
  ).filter((s) => {
    if (!s.parameters || s.parameters.length < 1) {
      return false;
    }
    if (s.codec.attributes) {
      return false;
    }
    if (!s.isUnique) {
      return false;
    }
    if (s.codec.arrayOfCodec) {
      return false;
    }
    const firstParameter = s.parameters[0] as PgResourceParameter;
    if (firstParameter.codec !== resource.codec) {
      return false;
    }
    return true;
  });
  return computedAttributeResources;
}

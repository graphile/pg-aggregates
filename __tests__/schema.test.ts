import { getSchema } from "./helpers.js";

it("generates schema", async () => {
  const { schema } = await getSchema();
  expect(schema).toMatchSnapshot();
});

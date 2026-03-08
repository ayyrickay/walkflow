import test from "node:test";
import assert from "node:assert/strict";

import { ownersFromRepoNames } from "../lib/github";

test("ownersFromRepoNames extracts unique owners and ignores invalid names", () => {
  const owners = ownersFromRepoNames([
    "acme/api",
    "acme/web",
    "other/repo",
    "invalid",
    " ",
    "other/repo"
  ]);

  assert.deepEqual(owners.sort(), ["acme", "other"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { inferProbeLocationScope } from "../src/tools/atsBoardProbe.js";

test("inferProbeLocationScope detects India and remote roles", () => {
  assert.equal(
    inferProbeLocationScope({
      location: "Hyderabad, Telangana, India",
      title: "Salesforce Developer"
    }),
    "india"
  );

  assert.equal(
    inferProbeLocationScope({
      location: "Remote",
      title: "Salesforce Architect"
    }),
    "remote_open"
  );

  assert.equal(
    inferProbeLocationScope({
      location: "Remote U.S.",
      title: "Salesforce Engineer"
    }),
    "restricted_remote"
  );

  assert.equal(
    inferProbeLocationScope({
      location: "Mexico",
      title: "Senior Salesforce Developer"
    }),
    "other"
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfficialReleasePayload,
  inferReleaseName,
  selectPersonalizedReleaseItems
} from "../src/releases/releaseCenter.js";

test("release sync payload infers the active Salesforce release from official source text", () => {
  const payload = buildOfficialReleasePayload({
    generatedAt: "2026-05-03T10:00:00.000Z",
    releasesHtml: "<h1>Salesforce Summer ’26 Release Notes</h1>",
    notesHtml: "Apex API Flow Agentforce Data Cloud security Lightning Web Components"
  });

  assert.equal(inferReleaseName("Salesforce Summer ’26 Release Notes"), "Summer '26");
  assert.equal(payload.activeRelease.releaseName, "Summer '26");
  assert.equal(payload.activeRelease.season, "Summer");
  assert.equal(payload.activeRelease.year, 2026);
  assert.equal(payload.items.length, 8);
  assert.equal(payload.items[0].releaseName, "Summer '26");
  assert.match(payload.version, /^summer-26-/);
});

test("personalized release items prefer matching categories and designation", () => {
  const items = [
    {
      category: "Apex",
      designations: ["Salesforce Developer"],
      experienceLevels: [3],
      title: "Apex"
    },
    {
      category: "Admin",
      designations: ["Admin + Developer"],
      experienceLevels: [1],
      title: "Admin"
    }
  ];

  const personalized = selectPersonalizedReleaseItems(items, {
    experienceYears: 3,
    designation: { label: "Salesforce Developer" },
    releaseFocus: { items: [{ category: "Apex" }] }
  });

  assert.equal(personalized.length, 1);
  assert.equal(personalized[0].category, "Apex");
});

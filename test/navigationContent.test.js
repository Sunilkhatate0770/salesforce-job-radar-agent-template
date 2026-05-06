import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadBrowserData(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.window;
}

test('navigation config uses required groups without fake legacy badges', () => {
  const { SFJR_NAVIGATION } = loadBrowserData('src/data/navigation.js');
  const labels = JSON.parse(JSON.stringify(SFJR_NAVIGATION.map(group => group.label)));
  assert.deepEqual(labels, [
    'Home & Dashboard',
    'Salesforce Core Developer',
    'Lightning & UI Development',
    'Salesforce Security & Data Model',
    'Integration & Enterprise Architecture',
    'Flow / Admin / Declarative',
    'Agentforce & Data Cloud',
    'FDE / Forward Deployed Engineer Prep',
    'Company-Specific Prep',
    'Mock Interview & Communication'
  ]);
  const serialized = JSON.stringify(SFJR_NAVIGATION);
  ["Spring '26", 'Beta', 'Live', 'Industrial Stability Sync', 'SF Prep Agent'].forEach(fakeLabel => {
    assert.equal(serialized.includes(fakeLabel), false);
  });
});

test('salesforce content bank satisfies minimum interview question counts', () => {
  const { SFJR_SALESFORCE_CONTENT } = loadBrowserData('src/data/salesforceContent.js');
  const required = {
    apex: 25,
    soql: 20,
    triggers: 25,
    async: 25,
    lwc: 30,
    lwc_communication: 20,
    integration: 25,
    crud_fls: 30,
    flow_master: 20,
    fde_dc_concept: 25,
    fde_ag_concept: 30,
    customer_discovery: 25,
    behavioral: 20,
    sc_recordpage: 15,
    sc_arch: 25
  };
  Object.entries(required).forEach(([sectionId, count]) => {
    const section = SFJR_SALESFORCE_CONTENT.getSection(sectionId);
    assert.ok(section, `${sectionId} exists`);
    assert.equal(section.questions.length, count, `${sectionId} question count`);
    assert.ok(section.questions.every(question => question.detailedAnswer.length > 100));
  });
});

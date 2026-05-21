// ES Module

  const sectionSeeds = [
    ['apex', 'Apex Fundamentals', 25, ['Apex', 'transactions', 'governor limits'], 'intermediate'],
    ['soql', 'SOQL & SOSL', 20, ['SOQL', 'SOSL', 'LDV', 'query plan'], 'intermediate'],
    ['triggers', 'Triggers & Order of Execution', 25, ['triggers', 'bulkification', 'order of execution'], 'intermediate'],
    ['async', 'Async Apex', 25, ['future', 'queueable', 'batch', 'scheduled apex'], 'intermediate'],
    ['lwc', 'LWC Core', 30, ['LWC', 'wire', 'events', 'LDS'], 'intermediate'],
    ['lwc_communication', 'LWC Communication', 20, ['custom events', 'Lightning Message Service', 'parent child'], 'intermediate'],
    ['integration', 'Integration', 25, ['REST', 'SOAP', 'Bulk API', 'Named Credentials'], 'advanced'],
    ['crud_fls', 'Security & Sharing', 30, ['CRUD', 'FLS', 'sharing', 'user mode'], 'advanced'],
    ['flow_master', 'Flow/Admin', 20, ['record-triggered flow', 'screen flow', 'Flow vs Apex'], 'intermediate'],
    ['fde_dc_concept', 'Data Cloud', 25, ['data streams', 'DLO', 'DMO', 'identity resolution'], 'advanced'],
    ['fde_ag_concept', 'Agentforce', 30, ['Agent Builder', 'topics', 'actions', 'Trust Layer', 'RAG'], 'advanced'],
    ['customer_discovery', 'FDE Scenarios', 25, ['discovery', 'whiteboarding', 'tradeoffs'], 'advanced'],
    ['behavioral', 'Manager/Behavioral STAR', 20, ['STAR', 'manager round', 'communication'], 'intermediate'],
    ['sc_recordpage', 'Record Page + LWC Communication', 15, ['recordId', 'LMS', 'refreshApex'], 'intermediate'],
    ['sc_arch', 'Architecture Scenarios', 25, ['architecture', 'LDV', 'integration', 'security'], 'advanced']
  ];

  const specificPrompts = {
    apex: [
      'How do you explain Apex as a strongly typed, object-oriented language for Salesforce server-side logic?',
      'How do Apex transaction boundaries affect DML, callouts, and rollback behavior?',
      'What bulk-safe pattern would you use when processing 200 records in a trigger?',
      'How do you avoid SOQL and DML inside loops?',
      'How should service classes separate business logic from triggers and controllers?'
    ],
    soql: [
      'When should you use SOQL instead of SOSL?',
      'How do you design a selective SOQL query for a large object?',
      'How do parent-to-child and child-to-parent relationship queries differ?',
      'How do aggregate queries help reporting-style Apex logic?',
      'How do you reason about pagination without OFFSET on large data sets?'
    ],
    triggers: [
      'Why is one trigger per object still the safest team pattern?',
      'How do you design a trigger handler pattern?',
      'How do you prevent recursive trigger execution?',
      'When should logic run in before triggers vs after triggers?',
      'How does order of execution affect validation, Flow, workflow, and rollups?'
    ],
    async: [
      'When would you choose Queueable Apex over Future methods?',
      'How do Batch Apex transaction boundaries work?',
      'How do you test async Apex with Test.startTest and Test.stopTest?',
      'How do Platform Events support retryable integration patterns?',
      'How do you design idempotent async processing?'
    ],
    lwc: [
      'How do LWC lifecycle hooks work?',
      'How do @api properties differ from tracked reactive state?',
      'When should you use @wire vs imperative Apex?',
      'How does Lightning Data Service reduce custom Apex?',
      'How do you design accessible LWC forms?'
    ],
    lwc_communication: [
      'How does a child LWC communicate with a parent?',
      'When should sibling components use Lightning Message Service?',
      'How does a record page pass recordId to a custom LWC?',
      'When is a parent wrapper component cleaner than global messaging?',
      'When should notifyRecordUpdateAvailable or refreshApex be used?'
    ],
    integration: [
      'How do Named Credentials and External Credentials improve integration security?',
      'How do you choose REST API, SOAP API, Bulk API, or Composite API?',
      'How do you handle callout timeouts and retries?',
      'How do you design idempotency for an external ERP integration?',
      'When should Change Data Capture be preferred over polling?'
    ],
    crud_fls: [
      'How do CRUD and FLS differ from record-level sharing?',
      'When should Apex use with sharing, without sharing, or inherited sharing?',
      'How do stripInaccessible and WITH SECURITY_ENFORCED differ?',
      'What changes when using user-mode database operations?',
      'How do you secure an Apex controller used by LWC?'
    ],
    flow_master: [
      'When should a requirement be built in Flow instead of Apex?',
      'How do you design fault paths for record-triggered flows?',
      'How do subflows improve maintainability?',
      'When should Flow call invocable Apex?',
      'How do scheduled flows compare with Scheduled Apex?'
    ],
    fde_dc_concept: [
      'What is the difference between Data Streams, DLOs, and DMOs?',
      'How does identity resolution create a unified profile?',
      'How do calculated insights support personalization?',
      'How do segmentation and activation differ?',
      'How would you use Data Cloud to ground an Agentforce response?'
    ],
    fde_ag_concept: [
      'What is Agentforce in practical enterprise terms?',
      'How do Agent Builder, topics, and actions fit together?',
      'How do prompt templates need to be secured?',
      'How does the Einstein Trust Layer reduce AI risk?',
      'How would you prevent hallucination with grounding and RAG?'
    ],
    customer_discovery: [
      'A customer wants Agentforce but their data quality is poor. How do you respond?',
      'A customer asks for a working executive demo in 48 hours. What is your plan?',
      'A customer has integration failures with an external ERP before launch. How do you triage?',
      'A customer wants Flow for everything. How do you explain Flow vs Apex tradeoffs?',
      'How do you handle unclear requirements in an FDE interview?'
    ],
    behavioral: [
      'Tell me about a time you handled a production issue.',
      'Tell me about a time you disagreed with a stakeholder.',
      'How do you explain technical tradeoffs to a manager?',
      'How do you handle a deadline when requirements are changing?',
      'How do you describe your Salesforce project clearly?'
    ],
    sc_recordpage: [
      'How does a custom LWC receive recordId on a Salesforce record page?',
      'How do two LWCs on the same record page communicate safely?',
      'When should CurrentPageReference state be enough?',
      'How do you refresh page data after an Apex update?',
      'When should pub-sub be avoided?'
    ],
    sc_arch: [
      'How would you design a scalable Salesforce integration architecture?',
      'How would you handle large data volume with strict sharing requirements?',
      'How would you design case deflection with Agentforce?',
      'How would you secure external API access from Salesforce?',
      'How would you plan a phased migration from legacy CRM to Salesforce?'
    ]
  };

  const byId = Object.fromEntries(sectionSeeds.map(([id, title, count, tags, difficulty]) => {
    const prompts = specificPrompts[id] || [];
    const questions = Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      const prompt = prompts[index] || `How would you handle ${title} scenario ${n} in a real Salesforce project?`;
      return {
        id: `${id}-q${String(n).padStart(2, '0')}`,
        sectionId: id,
        question: prompt,
        shortAnswer: `Start with the business intent, apply Salesforce platform limits and security, then choose the simplest maintainable ${title} pattern.`,
        detailedAnswer: `A strong interview answer explains the requirement, user impact, data/security context, transaction or runtime limits, and the implementation pattern. For ${title}, call out maintainability, bulk safety, testability, observability, and deployment risk. Avoid presenting a tool as the answer before validating volume, ownership, failure handling, and support needs.`,
        scenario: `You are asked to design or debug a ${title} feature for a 2-5 year Salesforce Developer/FDE role. The interviewer expects practical tradeoffs, not only definitions.`,
        followUps: [
          'What governor limits or runtime limits apply?',
          'How would you test this in a sandbox?',
          'How would you explain the tradeoff to a non-technical stakeholder?'
        ],
        commonMistakes: [
          'Ignoring CRUD/FLS or sharing context.',
          'Writing logic that works for one record but fails in bulk.',
          'Skipping failure handling, retries, monitoring, or clear assertions.'
        ],
        interviewTip: `Use a concise structure: requirement, design choice, security, limits, test strategy, and operational risk.`,
        codeExample: n % 4 === 0 ? 'Use a small handler/service method with bulk input, explicit assertions, and no SOQL/DML inside loops.' : '',
        relatedTopics: tags,
        difficulty,
        tags
      };
    });
    return [id, {
      id,
      title,
      description: `${title} interview bank for Salesforce Developer, Consultant, Agentforce, Data Cloud, and FDE preparation.`,
      difficulty,
      roleLevel: '2-5 years',
      tags,
      questionCount: count,
      estimatedMinutes: Math.max(30, Math.round(count * 4)),
      learningObjectives: [
        `Explain ${title} clearly in interviews.`,
        'Apply security, scale, testing, and maintainability tradeoffs.',
        'Answer scenario follow-ups with production-minded reasoning.'
      ],
      questions
    }];
  }));

  const scenarioDeepDives = [
    {
      id: 'trigger_handler_scenarios',
      title: 'Trigger Handler Scenarios',
      tags: ['trigger handler', 'recursion', 'bulkification', 'order of execution'],
      cases: [
        ['Account owner changes must update child Opportunities without recursion.', 'Move logic into one handler method, compare old/new owner values, query children once, update in bulk, and use a narrow recursion guard only around the second DML path.'],
        ['A trigger works for one record but fails when Data Loader inserts 200 records.', 'Collect record ids, query related data once, use maps for lookups, build one DML list, and prove it with a 200-record test method.'],
        ['Flow and trigger both update the same field and the value keeps changing.', 'Map the order of execution, identify the system of record for the field, then move the duplicate logic into one automation path with clear exit conditions.'],
        ['A before trigger calls a service that needs record Ids.', 'Use before logic only for same-record field changes. Move cross-record work that needs ids or related rows into after insert/update and keep both paths in the same handler contract.']
      ]
    },
    {
      id: 'soql_ldv_scenarios',
      title: 'SOQL LDV Scenarios',
      tags: ['SOQL', 'LDV', 'selectivity', 'query plan', 'indexing'],
      cases: [
        ['A nightly job times out querying millions of Cases by Status.', 'Filter with selective indexed fields such as CreatedDate, RecordTypeId, OwnerId, or an indexed external id, then process in windows instead of one broad query.'],
        ['A list view style LWC needs fast search and pagination.', 'Use selective search terms, keyset pagination, bounded page sizes, and avoid OFFSET for deep pages on large data.'],
        ['A relationship query returns too much data for an account hierarchy.', 'Query the parent set first, apply selective filters, then fetch child rows in batches with only required fields.'],
        ['An interviewer asks how you would prove a query is selective.', 'Explain Query Plan thinking: leading filters, cardinality, relative cost, indexes, skinny/standard indexes where appropriate, and realistic production data volumes.']
      ]
    },
    {
      id: 'lwc_performance_scenarios',
      title: 'LWC Performance Scenarios',
      tags: ['LWC', 'performance', 'datatable', 'wire', 'LDS'],
      cases: [
        ['A record page LWC loads slowly because it calls Apex three times.', 'Consolidate calls where possible, use LDS/UI API for record data, cache read-only Apex, and render skeleton states while data arrives.'],
        ['A datatable with 5,000 rows freezes the browser.', 'Use server-side filtering, pagination or virtualization, stable keys, and only render the fields the user can act on.'],
        ['A child component rerenders every keystroke and resets user input.', 'Avoid recreating object/array references unnecessarily, use stable keys, debounce search, and keep local edit state close to the input.'],
        ['A custom LWC is inaccessible on mobile keyboard navigation.', 'Use semantic controls, labels, focus-visible states, ARIA only where needed, and test touch target size plus tab order.']
      ]
    },
    {
      id: 'security_sharing_scenarios',
      title: 'Sharing Debug Scenarios',
      tags: ['sharing', 'OWD', 'role hierarchy', 'CRUD/FLS', 'user mode'],
      cases: [
        ['A user can open a record but cannot edit one field.', 'Separate record access from object CRUD and field-level security, then check permission sets, page layout visibility, validation rules, and user-mode Apex behavior.'],
        ['Managers cannot see team Opportunities after an OWD change.', 'Check OWD, role hierarchy, owner assignment, criteria/owner sharing rules, territory rules if used, and whether Apex queries run in system context.'],
        ['An LWC shows fields a user should not see.', 'Enforce CRUD/FLS in Apex using user-mode operations or stripInaccessible, prefer LDS/UI API where possible, and never rely only on hidden UI fields.'],
        ['A partner community user sees internal records.', 'Review external sharing model, sharing sets, account relationships, guest access, Apex sharing mode, and test with a real external user profile.']
      ]
    },
    {
      id: 'integration_retry_scenarios',
      title: 'Integration Retry Scenarios',
      tags: ['integration', 'retry', 'idempotency', 'Named Credentials', 'middleware'],
      cases: [
        ['ERP callouts fail intermittently during order submission.', 'Make the operation idempotent, store request status, retry asynchronously with backoff, and expose a support-friendly reconciliation view.'],
        ['A third-party API times out after Salesforce creates local records.', 'Separate local commit from external delivery using Queueable Apex or Platform Events, then retry safely without duplicate external records.'],
        ['Middleware sends the same customer update twice.', 'Use an idempotency key or external id, upsert instead of insert, and log duplicate delivery as success when the final state is already correct.'],
        ['Named Credential works in sandbox but fails in production.', 'Check External Credential principal mapping, permission set access, auth provider callback URLs, certificate/secrets, and endpoint allowlists.']
      ]
    },
    {
      id: 'flow_vs_apex_scenarios',
      title: 'Flow vs Apex Decision Scenarios',
      tags: ['Flow', 'Apex', 'tradeoffs', 'invocable Apex'],
      cases: [
        ['A business rule changes weekly and admins must maintain it.', 'Prefer Flow or configuration when the logic is declarative, auditable, and low risk for bulk or complex transaction behavior.'],
        ['A record-triggered automation needs complex map-based matching across thousands of records.', 'Use Apex for complex collection logic, testability, and governor-limit control, then expose a small invocable action if admins need orchestration.'],
        ['A Screen Flow needs a custom searchable related list.', 'Use Flow for the guided process and a focused LWC/Apex service for the complex UI or query behavior.'],
        ['A Flow creates mixed DML or callout sequencing issues.', 'Move the risky boundary into async Apex, Platform Events, or an after-commit pattern and keep Flow as the business orchestration layer.']
      ]
    },
    {
      id: 'data_cloud_identity_scenarios',
      title: 'Identity Resolution Scenarios',
      tags: ['Data Cloud', 'identity resolution', 'DLO', 'DMO', 'unified profile'],
      cases: [
        ['Marketing sees duplicate profiles for the same customer.', 'Validate source mappings from DLO to DMO, define match rules with stable identifiers, tune reconciliation rules, and explain confidence/merge risks.'],
        ['An Agentforce response uses stale customer preference data.', 'Check Data Stream freshness, calculated insight refresh cadence, segment activation timing, and whether the agent action is grounded on the right DMO fields.'],
        ['A customer has email, phone, and loyalty id conflicts.', 'Use deterministic identifiers where possible, avoid overmatching on weak signals, and document survivorship rules for each field.'],
        ['A stakeholder asks why Data Cloud is needed instead of another custom object.', 'Explain harmonization, identity resolution, segmentation, activation, and cross-cloud personalization without pretending it replaces transactional CRM records.']
      ]
    },
    {
      id: 'fde_customer_crisis_scenarios',
      title: 'Customer Crisis Scenarios',
      tags: ['FDE', 'production debugging', 'executive demo', 'stakeholders'],
      cases: [
        ['A production bug appears one hour before an executive demo.', 'Stabilize the demo path, identify rollback/feature-flag options, communicate impact clearly, and create a post-demo root cause plan.'],
        ['The customer wants Agentforce live but knowledge content is not trusted.', 'Narrow scope, ground on approved sources, add human handoff, measure answer quality, and position the launch as a controlled pilot.'],
        ['An integration partner blames Salesforce for missing records.', 'Trace correlation ids, compare source/target timestamps, inspect retry/dead-letter queues, and agree on one incident timeline.'],
        ['Sales, customer success, and engineering disagree on priority.', 'Translate each concern into customer impact, risk, effort, and deadline, then propose a phased plan with explicit tradeoffs.']
      ]
    },
    {
      id: 'manager_project_scenarios',
      title: 'Manager Round Project Scenarios',
      tags: ['manager round', 'project explanation', 'ownership', 'STAR'],
      cases: [
        ['Explain your most complex Salesforce project in two minutes.', 'Use context, responsibility, architecture, hard problem, measurable result, and what you would improve next.'],
        ['The manager asks why your team chose Apex instead of Flow.', 'Answer with data volume, complexity, testability, maintainability, and admin ownership, then mention where Flow still fit.'],
        ['You shipped a bug. What did you do?', 'Use STAR: own the issue, contain impact, communicate status, fix root cause, add prevention, and explain what changed in your process.'],
        ['How do you handle a stakeholder asking for unrealistic scope?', 'Clarify the outcome, break scope into must-have and later, show risks, offer a phased delivery path, and keep the relationship calm.']
      ]
    }
  ];

  function addScenarioDeepDive(definition) {
    const count = definition.count || 8;
    const questions = Array.from({ length: count }, (_, index) => {
      const item = definition.cases[index % definition.cases.length];
      const question = item[0];
      const answer = item[1];
      return {
        id: `${definition.id}-q${String(index + 1).padStart(2, '0')}`,
        sectionId: definition.id,
        question,
        shortAnswer: answer,
        detailedAnswer: `${answer} In an interview, start by clarifying the business impact, affected users, data volume, ownership model, security boundary, and release risk. Then give the implementation path, the tests you would write, and the operational checks you would monitor after deployment.`,
        scenario: question,
        followUps: [
          'What information would you ask for before choosing the solution?',
          'What could fail in production and how would you detect it?',
          'How would you explain the decision to a manager or customer?'
        ],
        commonMistakes: [
          'Jumping directly to code before clarifying impact and ownership.',
          'Ignoring security, limits, data volume, and support process.',
          'Giving a theoretical answer without a test or rollout plan.'
        ],
        interviewTip: 'Answer like a production engineer: clarify, contain risk, choose the simplest safe design, then explain testing and monitoring.',
        codeExample: '',
        relatedTopics: definition.tags,
        difficulty: 'advanced',
        tags: definition.tags
      };
    });
    byId[definition.id] = {
      id: definition.id,
      title: definition.title,
      description: `${definition.title} with practical interview cases, clarifying questions, tradeoffs, and production-minded answers.`,
      difficulty: 'advanced',
      roleLevel: '2-5 years',
      tags: definition.tags,
      questionCount: questions.length,
      estimatedMinutes: questions.length * 5,
      learningObjectives: [
        'Practice scenario answers with clear clarification and tradeoff structure.',
        'Connect the decision to Salesforce limits, security, data ownership, and rollout risk.',
        'Explain the solution in a manager/customer-friendly way.'
      ],
      questions
    };
  }

  scenarioDeepDives.forEach(addScenarioDeepDive);

  function buildNavigationFallbackSection(item, group) {
    const title = item.label || item.id;
    const tags = item.tags?.length ? item.tags : [title];
    const count = item.questionCount || (item.section === 'Scenario' ? 8 : 6);
    const difficulty = item.section === 'Scenario' ? 'advanced' : 'intermediate';
    const prompts = item.section === 'Scenario'
      ? [
          `How would you approach a real project scenario involving ${title}?`,
          `What clarifying questions would you ask before implementing ${title}?`,
          `What architecture, security, and data risks matter most for ${title}?`,
          `How would you explain the tradeoffs for ${title} to a business stakeholder?`
        ]
      : [
          `What are the core concepts an interviewer expects for ${title}?`,
          `How would you explain ${title} with a production Salesforce example?`,
          `What implementation pattern keeps ${title} maintainable and testable?`,
          `What common mistakes should you avoid when working with ${title}?`
        ];

    const questions = Array.from({ length: count }, (_, index) => {
      const prompt = prompts[index % prompts.length];
      return {
        id: `${item.id}-nav-q${String(index + 1).padStart(2, '0')}`,
        sectionId: item.id,
        question: prompt,
        shortAnswer: `Anchor the answer in the business requirement, Salesforce security model, platform limits, and a maintainable implementation approach for ${title}.`,
        detailedAnswer: `For ${title}, a strong answer should cover why the feature exists, which Salesforce capability is the best fit, how access and data ownership are enforced, how the design behaves in bulk or high-volume conditions, and how it will be tested. When the interviewer pushes deeper, compare the simple declarative option with the Apex, LWC, integration, or architecture option and explain the tradeoff in operational terms.`,
        scenario: `You are asked to design, debug, or explain ${title} in a Salesforce interview for the ${group.label} area.`,
        followUps: [
          'What can fail in production?',
          'How would you test this end to end?',
          'What would you monitor after release?'
        ],
        commonMistakes: [
          'Giving only a definition without a project example.',
          'Skipping CRUD/FLS, sharing, limits, or failure handling.',
          'Choosing a complex custom solution before checking standard Salesforce capability.'
        ],
        interviewTip: `Use a practical answer flow: requirement, platform choice, security, scale, testing, and support handoff.`,
        codeExample: '',
        relatedTopics: tags,
        difficulty,
        tags
      };
    });

    return {
      id: item.id,
      title,
      description: `${title} ${item.section || 'Core'} preparation for ${group.label}.`,
      difficulty,
      roleLevel: '2-5 years',
      tags,
      questionCount: count,
      estimatedMinutes: Math.max(24, count * 4),
      learningObjectives: [
        `Explain ${title} confidently with project context.`,
        'Connect the answer to Salesforce security, limits, testing, and maintainability.',
        'Handle scenario follow-ups without losing structure.'
      ],
      questions
    };
  }

  (window.SFJR_NAVIGATION || []).forEach(group => {
    (group.items || []).forEach(item => {
      if (!byId[item.id] && item.id !== 'bookmarks_page') {
        byId[item.id] = buildNavigationFallbackSection(item, group);
      }
    });
  });

  function asKnowledgeTopic(section) {
    return {
      title: section.title,
      subtitle: section.description,
      blocks: [
        { type: 'section', title: 'Interview Focus' },
        ...section.questions.map(q => ({
          type: 'qa',
          question: q.question,
          answer: `
            <p class="ans-p"><strong>Short answer:</strong> ${q.shortAnswer}</p>
            <p class="ans-p">${q.detailedAnswer}</p>
            <p class="ans-p"><strong>Scenario:</strong> ${q.scenario}</p>
            <p class="ans-p"><strong>Follow-ups:</strong> ${q.followUps.join(' | ')}</p>
            <p class="ans-p"><strong>Common mistakes:</strong> ${q.commonMistakes.join(' | ')}</p>
            <p class="ans-p"><strong>Interview tip:</strong> ${q.interviewTip}</p>
            ${q.codeExample ? `<pre><code>${q.codeExample}</code></pre>` : ''}
          `
        }))
      ]
    };
  }

export const SFJR_SALESFORCE_CONTENT = Object.freeze({
  sections: Object.values(byId),
  byId,
  asKnowledgeTopic,
  getSection(id) {
    return byId[id] || null;
  },
  getAllQuestions() {
    return Object.values(byId).flatMap(section => section.questions.map(question => ({ ...question, sectionTitle: section.title })));
  }
});
if (typeof window !== 'undefined') window.SFJR_SALESFORCE_CONTENT = SFJR_SALESFORCE_CONTENT;
if (typeof globalThis !== 'undefined') globalThis.SFJR_SALESFORCE_CONTENT = SFJR_SALESFORCE_CONTENT;

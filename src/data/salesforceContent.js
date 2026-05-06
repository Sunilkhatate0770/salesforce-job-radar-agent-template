(() => {
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

  window.SFJR_SALESFORCE_CONTENT = Object.freeze({
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
})();

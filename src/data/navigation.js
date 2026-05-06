(() => {
  /**
   * @typedef {Object} NavItem
   * @property {string} id
   * @property {string} label
   * @property {string} [description]
   * @property {string[]} [tags]
   * @property {string} [badgeSource]
   * @property {boolean} [requiresAuth]
   */
  /**
   * @typedef {Object} NavGroup
   * @property {string} id
   * @property {string} label
   * @property {string} description
   * @property {NavItem[]} items
   */

  const groups = [
    {
      id: 'home-dashboard',
      label: 'Home & Dashboard',
      description: 'Daily actions, progress, bookmarks, and job radar.',
      items: [
        { id: 'profile_match', label: 'Agent Dashboard', tags: ['dashboard', 'profile', 'home'], requiresAuth: true },
        { id: 'schedule', label: 'Daily Study Schedule', tags: ['plan', 'today', 'study'], requiresAuth: true },
        { id: 'study_tracker', label: 'Progress Tracker', tags: ['progress', 'analytics'], requiresAuth: true },
        { id: 'study_history', label: 'Study History', tags: ['history', 'sessions'], requiresAuth: true },
        { id: 'bookmarks_page', label: 'Bookmarked Q&A', tags: ['bookmarks', 'saved'], badgeSource: 'bookmarks', requiresAuth: true },
        { id: 'job_radar', label: 'Job Radar Dashboard', tags: ['jobs', 'pipeline', 'applications'], requiresAuth: true },
        { id: 'salesforce_releases', label: 'Salesforce Releases', tags: ['release', 'salesforce updates'], badgeSource: 'release', requiresAuth: true }
      ]
    },
    {
      id: 'core-developer',
      label: 'Salesforce Core Developer',
      description: 'Apex, data access, transactions, testing, and platform limits.',
      items: [
        { id: 'apex', label: 'Apex Fundamentals', tags: ['apex', 'oop', 'transactions'] },
        { id: 'soql', label: 'SOQL & SOSL', tags: ['soql', 'sosl', 'query'] },
        { id: 'triggers', label: 'Triggers & Order of Execution', tags: ['trigger', 'order of execution'] },
        { id: 'async', label: 'Async Apex', tags: ['future', 'queueable', 'batch', 'scheduled'] },
        { id: 'batch_apex', label: 'Batch Apex', tags: ['batch apex', 'large data'] },
        { id: 'queueable_apex', label: 'Queueable Apex', tags: ['queueable', 'chaining'] },
        { id: 'scheduled_apex', label: 'Scheduled Apex', tags: ['scheduled apex', 'cron'] },
        { id: 'governor_limits', label: 'Governor Limits', tags: ['limits', 'bulkification'] },
        { id: 'test_classes', label: 'Test Classes', tags: ['tests', 'coverage', 'assertions'] },
        { id: 'exception_handling', label: 'Exception Handling', tags: ['errors', 'logging'] }
      ]
    },
    {
      id: 'lightning-ui',
      label: 'Lightning & UI Development',
      description: 'LWC architecture, communication, performance, and accessibility.',
      items: [
        { id: 'lwc', label: 'LWC Core', tags: ['lwc', 'lifecycle', 'reactivity'] },
        { id: 'lwc_communication', label: 'LWC Communication', tags: ['events', 'lms', 'parent child'] },
        { id: 'wire_service', label: 'Wire Service', tags: ['wire', 'lds'] },
        { id: 'apex_lwc_integration', label: 'Apex + LWC Integration', tags: ['apex', 'imperative', 'wire'] },
        { id: 'lightning_data_service', label: 'Lightning Data Service', tags: ['lds', 'record ui'] },
        { id: 'sc_navmixin', label: 'NavigationMixin', tags: ['navigation', 'page reference'] },
        { id: 'sc_recordpage', label: 'Record Page + Custom LWC', tags: ['recordId', 'record page'] },
        { id: 'aura', label: 'Aura to LWC Migration', tags: ['aura', 'migration'] },
        { id: 'ui_performance', label: 'UI Performance', tags: ['performance', 'rendering'] },
        { id: 'ui_accessibility', label: 'Accessibility', tags: ['a11y', 'keyboard'] }
      ]
    },
    {
      id: 'security-data-model',
      label: 'Salesforce Security & Data Model',
      description: 'User access, secure Apex, object model, validation, and duplicate control.',
      items: [
        { id: 'profiles_permission_sets', label: 'Profiles / Permission Sets', tags: ['profiles', 'permission sets'] },
        { id: 'sharing_model', label: 'OWD / Role Hierarchy / Sharing Rules', tags: ['owd', 'roles', 'sharing'] },
        { id: 'apex_managed_sharing', label: 'Apex Managed Sharing', tags: ['apex sharing'] },
        { id: 'crud_fls', label: 'CRUD/FLS Enforcement', tags: ['crud', 'fls', 'security'] },
        { id: 'with_security_enforced', label: 'WITH SECURITY_ENFORCED', tags: ['soql security'] },
        { id: 'user_mode_system_mode', label: 'User Mode vs System Mode', tags: ['user mode', 'system mode'] },
        { id: 'sc_objects', label: 'Objects & Fields', tags: ['objects', 'fields'] },
        { id: 'relationships', label: 'Relationships', tags: ['lookup', 'master detail', 'junction'] },
        { id: 'sc_validation', label: 'Validation Rules', tags: ['validation'] },
        { id: 'duplicate_rules', label: 'Duplicate Rules', tags: ['duplicate management'] }
      ]
    },
    {
      id: 'integration-architecture',
      label: 'Integration & Enterprise Architecture',
      description: 'APIs, eventing, identity, middleware, retry design, and LDV.',
      items: [
        { id: 'rest_api', label: 'REST API', tags: ['rest', 'api'] },
        { id: 'soap_api', label: 'SOAP API', tags: ['soap', 'enterprise wsdl'] },
        { id: 'platform', label: 'Platform Events', tags: ['events', 'pub sub'] },
        { id: 'change_data_capture', label: 'Change Data Capture', tags: ['cdc'] },
        { id: 'named_credentials', label: 'Named Credentials', tags: ['named credentials', 'external credentials'] },
        { id: 'external_services', label: 'External Services', tags: ['external services'] },
        { id: 'oauth_flows', label: 'OAuth Flows', tags: ['oauth', 'identity'] },
        { id: 'middleware_patterns', label: 'Middleware Patterns', tags: ['mulesoft', 'middleware'] },
        { id: 'integration', label: 'Error Handling & Retry', tags: ['retry', 'idempotency'] },
        { id: 'large_data_volume', label: 'Large Data Volume', tags: ['ldv', 'query plan'] }
      ]
    },
    {
      id: 'flow-admin',
      label: 'Flow / Admin / Declarative',
      description: 'Flow design, admin automation, reports, and core Salesforce clouds.',
      items: [
        { id: 'record_triggered_flow', label: 'Record-Triggered Flow', tags: ['flow', 'record triggered'] },
        { id: 'screen_flow', label: 'Screen Flow', tags: ['screen flow'] },
        { id: 'scheduled_flow', label: 'Scheduled Flow', tags: ['scheduled flow'] },
        { id: 'flow_master', label: 'Flow vs Apex', tags: ['flow vs apex', 'tradeoffs'] },
        { id: 'approval_process', label: 'Approval Process', tags: ['approval'] },
        { id: 'sc_reports', label: 'Reports & Dashboards', tags: ['reports', 'dashboards'] },
        { id: 'sales_cloud', label: 'Sales Cloud', tags: ['sales cloud'] },
        { id: 'service_cloud', label: 'Service Cloud', tags: ['service cloud'] },
        { id: 'experience_cloud', label: 'Experience Cloud', tags: ['experience cloud'] }
      ]
    },
    {
      id: 'agentforce-data-cloud',
      label: 'Agentforce & Data Cloud',
      description: 'Agentforce, trust, grounding, Data Cloud, activation, and AI scenarios.',
      items: [
        { id: 'fde_ag_concept', label: 'Agentforce Core', tags: ['agentforce'] },
        { id: 'agent_builder', label: 'Agent Builder', tags: ['agent builder'] },
        { id: 'agent_topics_actions', label: 'Topics & Actions', tags: ['topics', 'actions'] },
        { id: 'prompt_templates', label: 'Prompt Templates', tags: ['prompts'] },
        { id: 'fde_atlas', label: 'Atlas Reasoning Engine', tags: ['atlas'] },
        { id: 'fde_trust', label: 'Einstein Trust Layer', tags: ['trust layer'] },
        { id: 'rag_grounding', label: 'RAG', tags: ['rag', 'grounding'] },
        { id: 'fde_dc_concept', label: 'Data Cloud Basics', tags: ['data cloud'] },
        { id: 'data_streams', label: 'Data Streams', tags: ['data streams'] },
        { id: 'data_lake_objects', label: 'Data Lake Objects', tags: ['dlo'] },
        { id: 'data_model_objects', label: 'Data Model Objects', tags: ['dmo'] },
        { id: 'identity_resolution', label: 'Identity Resolution', tags: ['identity resolution'] },
        { id: 'calculated_insights', label: 'Calculated Insights', tags: ['calculated insights'] },
        { id: 'segmentation', label: 'Segmentation', tags: ['segmentation'] },
        { id: 'activation', label: 'Activation', tags: ['activation'] },
        { id: 'agentforce_apex', label: 'Agentforce + Apex', tags: ['agentforce apex'] },
        { id: 'agentforce_flow', label: 'Agentforce + Flow', tags: ['agentforce flow'] },
        { id: 'agentforce_data_cloud', label: 'Agentforce + Data Cloud Scenarios', tags: ['agentforce data cloud'] }
      ]
    },
    {
      id: 'fde-prep',
      label: 'FDE / Forward Deployed Engineer Prep',
      description: 'Discovery, solution design, demos, stakeholder communication, and production judgement.',
      items: [
        { id: 'customer_discovery', label: 'Customer Discovery', tags: ['fde', 'discovery'] },
        { id: 'requirement_breakdown', label: 'Requirement Breakdown', tags: ['requirements'] },
        { id: 'solution_design', label: 'Solution Design', tags: ['solution design'] },
        { id: 'architecture_whiteboarding', label: 'Architecture Whiteboarding', tags: ['whiteboarding'] },
        { id: 'stakeholder_communication', label: 'Stakeholder Communication', tags: ['stakeholders'] },
        { id: 'tradeoff_explanation', label: 'Tradeoff Explanation', tags: ['tradeoffs'] },
        { id: 'implementation_planning', label: 'Implementation Planning', tags: ['implementation'] },
        { id: 'demo_storytelling', label: 'Demo Storytelling', tags: ['demo'] },
        { id: 'production_debugging', label: 'Production Debugging', tags: ['debugging'] },
        { id: 'fde_behavioral', label: 'Behavioral STAR Answers', tags: ['star', 'behavioral'] }
      ]
    },
    {
      id: 'company-prep',
      label: 'Company-Specific Prep',
      description: 'General interview patterns by company type without fake hiring claims.',
      items: [
        { id: 'sf_official', label: 'Salesforce Official', tags: ['salesforce company'] },
        { id: 'deloitte', label: 'Deloitte', tags: ['deloitte'] },
        { id: 'accenture', label: 'Accenture', tags: ['accenture'] },
        { id: 'infosys_prep', label: 'Infosys', tags: ['infosys'] },
        { id: 'tcs_prep', label: 'TCS', tags: ['tcs'] },
        { id: 'capgemini_prep', label: 'Capgemini', tags: ['capgemini'] },
        { id: 'cognizant_prep', label: 'Cognizant', tags: ['cognizant'] },
        { id: 'persistent_prep', label: 'Persistent', tags: ['persistent'] },
        { id: 'epam_prep', label: 'EPAM', tags: ['epam'] },
        { id: 'product_company_round', label: 'Product Company Round', tags: ['product company'] }
      ]
    },
    {
      id: 'mock-communication',
      label: 'Mock Interview & Communication',
      description: 'Speaking, behavioral, project explanation, manager round, and AI mock practice.',
      items: [
        { id: 'intro', label: 'Self Introduction', tags: ['introduction'] },
        { id: 'project_explanation', label: 'Project Explanation', tags: ['project'] },
        { id: 'behavioral', label: 'Behavioral Q&A', tags: ['behavioral'] },
        { id: 'manager_round', label: 'Manager Round', tags: ['manager'] },
        { id: 'salary', label: 'Salary Negotiation', tags: ['salary'] },
        { id: 'speaking', label: 'English Speaking Drills', tags: ['english', 'speaking'] },
        { id: 'ai_interview', label: 'AI Mock Interview', tags: ['ai interview'], requiresAuth: true }
      ]
    }
  ];

  window.SFJR_NAVIGATION = Object.freeze(groups);
})();

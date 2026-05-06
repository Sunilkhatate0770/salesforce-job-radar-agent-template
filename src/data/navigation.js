(() => {
  /**
   * @typedef {Object} NavItem
   * @property {string} id
   * @property {string} label
   * @property {string} [description]
   * @property {string[]} [tags]
   * @property {string} [section] Core or Scenario subsection inside the group.
   * @property {number} [questionCount]
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

  const i = (id, label, tags = [], section = 'Core', extra = {}) => ({
    id,
    label,
    tags,
    section,
    ...extra
  });

  const groups = [
    {
      id: 'home-dashboard',
      label: 'Home & Dashboard',
      description: 'Private workspace, daily plan, progress, bookmarks, releases, and Job Radar.',
      items: [
        i('profile_match', 'Agent Dashboard', ['dashboard', 'profile', 'home'], 'Core', { requiresAuth: true }),
        i('schedule', 'Daily Study Schedule', ['plan', 'today', 'study'], 'Core', { requiresAuth: true }),
        i('study_tracker', 'Progress Tracker', ['progress', 'analytics'], 'Core', { requiresAuth: true }),
        i('study_history', 'Study History', ['history', 'sessions'], 'Core', { requiresAuth: true }),
        i('bookmarks_page', 'Bookmarked Q&A', ['bookmarks', 'saved'], 'Core', { badgeSource: 'bookmarks', requiresAuth: true }),
        i('salesforce_releases', 'Salesforce Releases', ['release', 'salesforce updates'], 'Core', { badgeSource: 'release', requiresAuth: true }),
        i('job_radar', 'Job Radar Dashboard', ['jobs', 'pipeline', 'applications'], 'Scenario', { requiresAuth: true }),
        i('code_practice', 'Code Practice Lab', ['html', 'javascript', 'apex', 'triggers', 'practice'], 'Scenario', { requiresAuth: true })
      ]
    },
    {
      id: 'core-developer',
      label: 'Salesforce Core Developer',
      description: 'Apex, data access, transactions, testing, limits, and scenario drills.',
      items: [
        i('apex', 'Apex Core', ['apex', 'oop', 'transactions'], 'Core', { questionCount: 22 }),
        i('soql', 'SOQL Deep Dive', ['soql', 'sosl', 'query'], 'Core', { questionCount: 14 }),
        i('triggers', 'Triggers & Patterns', ['trigger', 'order of execution'], 'Core', { questionCount: 14 }),
        i('async', 'Async Apex', ['future', 'queueable', 'batch', 'scheduled'], 'Core', { questionCount: 16 }),
        i('adv_apex', 'Advanced Apex', ['apex', 'senior', 'limits'], 'Core', { questionCount: 18 }),
        i('batch_apex', 'Batch Apex', ['batch apex', 'large data'], 'Core'),
        i('queueable_apex', 'Queueable Apex', ['queueable', 'chaining'], 'Core'),
        i('scheduled_apex', 'Scheduled Apex', ['scheduled apex', 'cron'], 'Core'),
        i('governor_limits', 'Governor Limits', ['limits', 'bulkification'], 'Core'),
        i('test_classes', 'Test Classes', ['tests', 'coverage', 'assertions'], 'Core'),
        i('exception_handling', 'Exception Handling', ['errors', 'logging'], 'Core'),
        i('order_of_execution', 'Order of Execution', ['save cycle', 'automation order'], 'Core'),
        i('sc_async', 'Async Processing + Credit Pull', ['async', 'callout', 'credit pull'], 'Scenario', { questionCount: 10 }),
        i('scenario', 'Architecture Scenario Questions', ['scenario', 'architect thinking'], 'Scenario', { questionCount: 16 }),
        i('trigger_handler_scenarios', 'Trigger Handler Scenarios', ['trigger handler', 'recursion', 'bulkification'], 'Scenario', { questionCount: 8 }),
        i('soql_ldv_scenarios', 'SOQL LDV Scenarios', ['soql', 'ldv', 'selectivity'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'lightning-ui',
      label: 'Lightning & UI Development',
      description: 'LWC/Aura fundamentals, communication, performance, accessibility, and record-page scenarios.',
      items: [
        i('lwc', 'LWC Components', ['lwc', 'lifecycle', 'reactivity'], 'Core', { questionCount: 20 }),
        i('aura', 'Aura Components', ['aura', 'legacy'], 'Core', { questionCount: 10 }),
        i('adv_lwc', 'Advanced LWC', ['lwc', 'performance', 'testing'], 'Core', { questionCount: 13 }),
        i('lwc_communication', 'LWC Communication', ['events', 'lms', 'parent child'], 'Core'),
        i('wire_service', 'Wire Service', ['wire', 'lds'], 'Core'),
        i('apex_lwc_integration', 'Apex + LWC Integration', ['apex', 'imperative', 'wire'], 'Core'),
        i('lightning_data_service', 'Lightning Data Service', ['lds', 'record ui'], 'Core'),
        i('sc_navmixin', 'NavigationMixin', ['navigation', 'page reference'], 'Core', { questionCount: 10 }),
        i('ui_performance', 'UI Performance', ['performance', 'rendering'], 'Core'),
        i('ui_accessibility', 'Accessibility', ['a11y', 'keyboard'], 'Core'),
        i('sc_recordpage', 'Record Page + Custom LWC', ['recordId', 'record page', 'LMS'], 'Scenario', { questionCount: 10 }),
        i('sc_fileupload', 'File Upload + Google Drive', ['files', 'external storage'], 'Scenario', { questionCount: 10 }),
        i('lwc_performance_scenarios', 'LWC Performance Scenarios', ['lwc', 'performance', 'datatable'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'security-data-model',
      label: 'Salesforce Security & Data Model',
      description: 'Security layers, sharing, object model, validation, and data-quality scenarios.',
      items: [
        i('security', 'Security & Sharing', ['security', 'sharing'], 'Core', { questionCount: 18 }),
        i('security_full', 'Security Full Guide', ['security model', 'reference'], 'Core'),
        i('security_5_layers', 'Salesforce 5 Security Layers', ['org', 'object', 'field', 'record'], 'Core'),
        i('profiles_permission_sets', 'Profiles / Permission Sets', ['profiles', 'permission sets'], 'Core'),
        i('sharing_model', 'OWD / Role Hierarchy / Sharing Rules', ['owd', 'roles', 'sharing'], 'Core'),
        i('apex_managed_sharing', 'Apex Managed Sharing', ['apex sharing'], 'Core'),
        i('crud_fls', 'CRUD/FLS Enforcement', ['crud', 'fls', 'security'], 'Core'),
        i('with_security_enforced', 'WITH SECURITY_ENFORCED', ['soql security'], 'Core'),
        i('user_mode_system_mode', 'User Mode vs System Mode', ['user mode', 'system mode'], 'Core'),
        i('sc_objects', 'Objects & Fields', ['objects', 'fields'], 'Core', { questionCount: 10 }),
        i('relationships', 'Relationships', ['lookup', 'master detail', 'junction'], 'Core'),
        i('sc_validation', 'Validation Scenarios', ['validation'], 'Scenario', { questionCount: 10 }),
        i('duplicate_rules', 'Duplicate Rules', ['duplicate management'], 'Scenario'),
        i('security_sharing_scenarios', 'Sharing Debug Scenarios', ['sharing', 'owd', 'role hierarchy'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'integration-architecture',
      label: 'Integration & Enterprise Architecture',
      description: 'APIs, events, identity, middleware, retry design, LDV, and senior integration scenarios.',
      items: [
        i('integration', 'Integration & APIs', ['rest', 'soap', 'api'], 'Core', { questionCount: 18 }),
        i('adv_intg', 'Advanced Integration', ['enterprise integration', 'middleware'], 'Core', { questionCount: 13 }),
        i('platform', 'Platform Events & CDC', ['platform events', 'cdc'], 'Core', { questionCount: 10 }),
        i('rest_api', 'REST API', ['rest', 'api'], 'Core'),
        i('soap_api', 'SOAP API', ['soap', 'enterprise wsdl'], 'Core'),
        i('change_data_capture', 'Change Data Capture', ['cdc'], 'Core'),
        i('named_credentials', 'Named Credentials', ['named credentials', 'external credentials'], 'Core'),
        i('external_services', 'External Services', ['external services'], 'Core'),
        i('oauth_flows', 'OAuth Flows', ['oauth', 'identity'], 'Core'),
        i('middleware_patterns', 'Middleware Patterns', ['mulesoft', 'middleware'], 'Core'),
        i('large_data_volume', 'Large Data Volume', ['ldv', 'query plan'], 'Core'),
        i('sc_arch', 'Architecture Mix', ['architecture', 'LDV', 'integration', 'security'], 'Scenario', { questionCount: 10 }),
        i('fde_integration', 'FDE Integration Patterns', ['agentforce', 'data cloud', 'integration'], 'Scenario', { questionCount: 5 }),
        i('integration_retry_scenarios', 'Integration Retry Scenarios', ['retry', 'idempotency', 'middleware'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'flow-admin',
      label: 'Flow / Admin / Declarative',
      description: 'Flow, admin configuration, reports, clouds, and declarative scenario practice.',
      items: [
        i('admin', 'Admin & Configuration', ['admin', 'configuration'], 'Core', { questionCount: 14 }),
        i('flows_guide', 'Flow Complete Guide', ['flow', 'reference'], 'Core'),
        i('flow_master', 'Flow vs Apex', ['flow vs apex', 'tradeoffs'], 'Core'),
        i('record_triggered_flow', 'Record-Triggered Flow', ['flow', 'record triggered'], 'Core'),
        i('screen_flow', 'Screen Flow', ['screen flow'], 'Core'),
        i('scheduled_flow', 'Scheduled Flow', ['scheduled flow'], 'Core'),
        i('approval_process', 'Approval Process', ['approval'], 'Core'),
        i('reports_guide', 'Reports Full Guide', ['reports', 'analytics api'], 'Core'),
        i('sc_reports', 'Reports & Dashboards', ['reports', 'dashboards'], 'Scenario', { questionCount: 10 }),
        i('sales_cloud', 'Sales Cloud', ['sales cloud'], 'Core'),
        i('service_cloud', 'Service Cloud', ['service cloud'], 'Core'),
        i('experience_cloud', 'Experience Cloud', ['experience cloud'], 'Core'),
        i('sc_flow', 'Flow Scenarios', ['flow scenario', 'invocable apex'], 'Scenario', { questionCount: 10 }),
        i('flow_vs_apex_scenarios', 'Flow vs Apex Decision Scenarios', ['flow vs apex', 'tradeoff'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'agentforce-data-cloud',
      label: 'Agentforce & Data Cloud',
      description: 'Agentforce, trust, grounding, Data Cloud, activation, and AI implementation scenarios.',
      items: [
        i('agentforce_guide', 'Agentforce Reference', ['agentforce', 'reference'], 'Core'),
        i('fde_ag_concept', 'Agentforce Core', ['agentforce'], 'Core', { questionCount: 8 }),
        i('agent_builder', 'Agent Builder', ['agent builder'], 'Core'),
        i('agent_topics_actions', 'Topics & Actions', ['topics', 'actions'], 'Core'),
        i('prompt_templates', 'Prompt Templates', ['prompts'], 'Core'),
        i('fde_atlas', 'Atlas Reasoning Engine', ['atlas'], 'Core', { questionCount: 6 }),
        i('fde_trust', 'Einstein Trust Layer', ['trust layer'], 'Core', { questionCount: 5 }),
        i('rag_grounding', 'RAG & Grounding', ['rag', 'grounding'], 'Core'),
        i('fde_dc_concept', 'Data Cloud Core', ['data cloud'], 'Core', { questionCount: 8 }),
        i('data_streams', 'Data Streams', ['data streams'], 'Core'),
        i('data_lake_objects', 'Data Lake Objects', ['dlo'], 'Core'),
        i('data_model_objects', 'Data Model Objects', ['dmo'], 'Core'),
        i('identity_resolution', 'Identity Resolution', ['identity resolution'], 'Core'),
        i('calculated_insights', 'Calculated Insights', ['calculated insights'], 'Core'),
        i('segmentation', 'Segmentation', ['segmentation'], 'Core'),
        i('activation', 'Activation', ['activation'], 'Core'),
        i('fde_ag_scenario', 'Agentforce Scenarios', ['agentforce scenario'], 'Scenario', { questionCount: 5 }),
        i('sc_agentforce', 'Agentforce Scenario Questions', ['agentforce', 'scenario'], 'Scenario', { questionCount: 10 }),
        i('fde_dc_adv', 'Data Cloud Advanced Scenarios', ['data cloud', 'scenario'], 'Scenario', { questionCount: 7 }),
        i('agentforce_apex', 'Agentforce + Apex', ['agentforce apex'], 'Scenario'),
        i('agentforce_flow', 'Agentforce + Flow', ['agentforce flow'], 'Scenario'),
        i('agentforce_data_cloud', 'Agentforce + Data Cloud', ['agentforce data cloud'], 'Scenario'),
        i('data_cloud_identity_scenarios', 'Identity Resolution Scenarios', ['data cloud', 'identity resolution'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'fde-prep',
      label: 'FDE / Forward Deployed Engineer Prep',
      description: 'Discovery, solution design, demos, stakeholder communication, and production judgement.',
      items: [
        i('fde_cheat', 'FDE Cheat Sheet', ['quick fire', 'definitions'], 'Core', { questionCount: 7 }),
        i('customer_discovery', 'Customer Discovery', ['fde', 'discovery'], 'Core'),
        i('requirement_breakdown', 'Requirement Breakdown', ['requirements'], 'Core'),
        i('solution_design', 'Solution Design', ['solution design'], 'Core'),
        i('architecture_whiteboarding', 'Architecture Whiteboarding', ['whiteboarding'], 'Core'),
        i('stakeholder_communication', 'Stakeholder Communication', ['stakeholders'], 'Core'),
        i('tradeoff_explanation', 'Tradeoff Explanation', ['tradeoffs'], 'Core'),
        i('implementation_planning', 'Implementation Planning', ['implementation'], 'Core'),
        i('demo_storytelling', 'Demo Storytelling', ['demo'], 'Core'),
        i('production_debugging', 'Production Debugging', ['debugging'], 'Scenario'),
        i('fde_behavioral', 'FDE Behavioral', ['star', 'behavioral'], 'Scenario', { questionCount: 9 }),
        i('fde_apex', 'Apex in Agents', ['apex', 'agentforce'], 'Scenario', { questionCount: 6 }),
        i('fde_customer_crisis_scenarios', 'Customer Crisis Scenarios', ['fde', 'production issue', 'executive demo'], 'Scenario', { questionCount: 8 })
      ]
    },
    {
      id: 'company-prep',
      label: 'Company-Specific Prep',
      description: 'General interview patterns by company type plus real model-answer pages from the guide.',
      items: [
        i('sf_official', 'Salesforce Official', ['salesforce company'], 'Core'),
        i('deloitte', 'Deloitte', ['deloitte'], 'Core'),
        i('accenture', 'Accenture', ['accenture'], 'Core'),
        i('infosys_prep', 'Infosys', ['infosys'], 'Core'),
        i('tcs_prep', 'TCS', ['tcs'], 'Core'),
        i('capgemini_prep', 'Capgemini', ['capgemini'], 'Core'),
        i('cognizant_prep', 'Cognizant', ['cognizant'], 'Core'),
        i('persistent_prep', 'Persistent', ['persistent'], 'Core'),
        i('epam_prep', 'EPAM', ['epam'], 'Core'),
        i('product_company_round', 'Product Company Round', ['product company'], 'Core'),
        i('company_interviews', 'Arago & Morgan Stanley Q&A', ['company interview', 'real questions'], 'Scenario'),
        i('company_iq', 'Company Model Answers', ['model answers'], 'Scenario'),
        i('mobigic_pwc', 'Mobigic / PWC Screening', ['screening'], 'Scenario'),
        i('thenken_globus', 'Thenken Globus Tech Round', ['technical round'], 'Scenario')
      ]
    },
    {
      id: 'mock-communication',
      label: 'Mock Interview & Communication',
      description: 'Speaking, behavioral, project explanation, manager round, and AI mock practice.',
      items: [
        i('comm30', '30-Day Communication Plan', ['communication', 'daily drills'], 'Core'),
        i('eng30', '30-Day Speaking Plan', ['english', 'speaking'], 'Core'),
        i('eng_starters', '50 Sentence Starters', ['sentence starters'], 'Core'),
        i('eng_phrases', 'Difficult Situation Scripts', ['phrases', 'difficult situations'], 'Core'),
        i('speaking', 'Speaking Drills', ['english', 'speaking'], 'Core'),
        i('mistakes', 'Common Communication Mistakes', ['communication mistakes'], 'Core'),
        i('comm', 'Communication Scripts', ['scripts'], 'Core'),
        i('vocab', 'Vocabulary & Phrases', ['vocabulary'], 'Core'),
        i('intro', 'Self Introduction', ['introduction'], 'Core'),
        i('questions', 'Questions to Ask Them', ['interviewer questions'], 'Core', { questionCount: 20 }),
        i('project_explanation', 'Project Explanation', ['project'], 'Scenario'),
        i('behavioral', 'Behavioral Q&A', ['behavioral'], 'Scenario', { questionCount: 20 }),
        i('manager_round', 'Manager Round', ['manager'], 'Scenario'),
        i('manager_project_scenarios', 'Manager Round Project Scenarios', ['manager', 'project explanation', 'ownership'], 'Scenario', { questionCount: 8 }),
        i('salary', 'Salary Negotiation', ['salary'], 'Scenario'),
        i('mock', 'Mock Interview Scripts', ['mock interview'], 'Scenario'),
        i('ai_interview', 'AI Mock Interview', ['ai interview'], 'Scenario', { requiresAuth: true })
      ]
    }
  ];

  window.SFJR_NAVIGATION = Object.freeze(groups);
})();

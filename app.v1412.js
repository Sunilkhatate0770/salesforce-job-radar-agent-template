// Version: 2026-04-26-T1200 (Industrial Enrichment v1412)
// =============================================
const DASHBOARD_VERSION = "2026-04-26-T1200 (app.v1412.js - Production Dashboard Logic)";
console.log('%c Dashboard Version: 2026-04-26-T1200 (EXTREME LOGGING v1412)', 'color: #3b82f6; font-weight: bold; font-size: 1.2rem;');
if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(regs => { for (let reg of regs) reg.unregister(); }); }
var TRACKER_KEY = 'sf_prep_study_tracker_v3';
var currentTrackedPage = null;
var trackingStartTime = null;
var trackingInterval = null;
var isPaused = false;
var pausedElapsed = 0;
let globalStudyData = { topics: {}, sessions: [], completedTasks: [] };
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 60000;
let currentUser = null;
let GSI_TOKEN = localStorage.getItem('google_auth_token') || null;
// --- CLOUD-NATIVE STATE (v1356) ---
let userBookmarks = []; 
let studyStreak = { current: 0, best: 0, lastDate: "" };
let userRetention = {};
let currentRetentionTopicId = null;
let sessionFeedbackProvided = new Set(); 

// --- JOB RADAR PIPELINE STATE (v1399) ---
let pipelineJobs = JSON.parse(localStorage.getItem('sfpipe2026v3')) || [];
let activityLog = JSON.parse(localStorage.getItem('sfActivityLog')) || [];
let currentBoardFilter = 'all';
let currentBoardSearch = '';
let currentRadarSubTab = 'pipeline';
let currentPrepCompany = 'Cognizant';
let cachedHistories = {};

const PREP_REGISTRY = {
  "Cognizant": {
    focus: "Apex best practices, LWC event system, Governor Limits, DevOps",
    questions: ["Explain your trigger handler pattern and why you chose it", "How do you handle bulk operations in Apex?", "Difference between before vs after triggers - when to use each?", "How does LWC parent-child communication work (events vs LMS)?", "What Governor Limits do you hit most and how do you avoid them?"],
    tips: ["Emphasize PD1+PD2 certs upfront", "Talk about code review experience", "Mention your Bitbucket/CI-CD pipeline work"]
  },
  "Deloitte India": {
    focus: "BFSI domain, FSC objects, data governance, integration patterns",
    questions: ["Describe your financial services Salesforce implementations", "How did you handle FCRA/HMDA compliance in Salesforce?", "Explain Platform Events vs Triggers - when to pick each?"],
    tips: ["Lead with your mortgage domain expertise", "Prepare a 5-min story of your Experian credit bureau integration"]
  },
  "Salesforce Inc.": {
    focus: "Product engineering, scale, Agentforce, Data Cloud, Core internals",
    questions: ["How do you design for multi-tenancy?", "Explain the Atlas reasoning engine in Agentforce", "Difference between DLO and DMO in Data Cloud"],
    tips: ["Emphasize innovation and 'Customer Success' focus", "Talk about your Agentforce Specialist certification"]
  }
};

// =============================================
// DYNAMIC CONTENT DATA (MASTER REGISTRY v1399)
// =============================================
// NOTE: Core topics (Apex, LWC, etc.) are hardcoded in index.html for maximum depth.
var TOPIC_DATA = {
  // --- COMPANY SPECIFIC PREP ---
  'deloitte': {
    title: 'Deloitte Salesforce Interview (2026)',
    subtitle: 'Advanced architectural screening and scenario drills for Senior Roles.',
    blocks: [
      { type: 'section', title: 'Enterprise Architecture' },
      { type: 'qa', question: 'How do you handle Large Data Volumes (LDV) in a Deloitte global org?', answer: '<p class="ans-p">Handling LDV requires a multi-layered approach to prevent locking and governor limit exhaustion:</p><ul class="ans-list"><li><b>Skinny Tables:</b> Request Salesforce Support to enable skinny tables to include frequently used fields and avoid joins.</li><li><b>Custom Indexes:</b> Use the Index checkbox on custom fields to optimize SOQL WHERE clauses.</li><li><b>Division:</b> Use divisions to segment data and improve performance in massive orgs.</li><li><b>Async Processing:</b> Use <code>Queueable</code> with <code>Database.AllowsCallouts</code> to offload processing and maintain UI responsiveness.</li></ul>' },
      { type: 'qa', question: 'Explain the importance of "Quality Engineering" at Deloitte.', answer: '<p class="ans-p">Quality Engineering (QE) is the evolution of QA, embedding testing into the entire lifecycle:</p><ul class="ans-list"><li><b>Shift Left:</b> Unit testing (Apex & Jest) is performed immediately during development.</li><li><b>Static Analysis:</b> Continuous use of PMD, Checkmarx, and Salesforce Code Analyzer (SFCA).</li><li><b>Automated Regression:</b> Using Copado or Jenkins pipelines to run all tests before merging into the Integration branch.</li></ul>' },
      { type: 'qa', question: 'Scenario: How to handle 100k+ record updates daily without hitting limits?', answer: '<p class="ans-p">Use <b>Batch Apex</b> with a targeted scope size (typically 200). If the logic is relatively simple, <b>Platform Events</b> can be used to decouple the update from the source transaction, allowing for much higher throughput and parallel processing.</p>' },
      { type: 'section', title: 'April 2026 Interview Updates' },
      { type: 'qa', question: 'Scenario: Write a trigger to store Contact count on Account without using Roll-up Summary.', answer: '<p class="ans-p">Since Account and Contact are standard objects in a lookup relationship (not Master-Detail), we must use Apex:</p><ol class="ans-list"><li><b>Collect Account IDs:</b> In <code>after insert</code>, <code>after update</code>, and <code>after delete</code>, collect all <code>AccountId</code> values into a <code>Set&lt;Id&gt;</code>.</li><li><b>Aggregate Query:</b> Run an <code>AggregateResult</code> query: <code>[SELECT AccountId, COUNT(Id) cnt FROM Contact WHERE AccountId IN :accIds GROUP BY AccountId]</code>.</li><li><b>Update Accounts:</b> Loop through the results, create new Account instances with the count, and perform a single <code>update</code> DML on the list.</li><li><b>Recursion:</b> Ensure you use a static boolean flag to prevent the update from re-triggering logic if other triggers exist.</li></ol>' },
      { type: 'qa', question: 'Compare Custom Settings vs. Custom Metadata for Deloitte projects.', answer: '<p class="ans-p"><b>Custom Metadata (Preferred):</b> Deployable via change sets/packages, queryable without DML limits, supports relationship fields, and perfect for app configurations/mappings. <b>Custom Settings:</b> Better for "Hierarchy" settings (user-specific values) or frequently updated "List" settings if the volume is low, but metadata is the modern standard for enterprise config.</p>' },
      { type: 'qa', question: 'Explain the 3 Layers of the Salesforce Security Model.', answer: '<p class="ans-p">Deloitte interviewers look for this hierarchy:</p><ol class="ans-list"><li><b>Object Level (CRUD):</b> Profiles and Permission Sets control what objects a user can see/edit.</li><li><b>Field Level (FLS):</b> Controls visibility/editability of specific fields within those objects.</li><li><b>Record Level (Sharing):</b> Controlled by OWD (baseline), Role Hierarchy (vertical), Sharing Rules (horizontal), and Apex Sharing (complex).</li></ol>' },
      { type: 'qa', question: 'Batch Apex: How many classes can be chained and what is Database.Stateful?', answer: '<p class="ans-p">You can chain <b>one</b> batch job from the <code>finish()</code> method. <b>Database.Stateful</b> is used to maintain state (instance variables) across different batches. By default, each batch execution is stateless; implementing this interface allows you to track counters or lists across the entire job.</p>' }
    ]
  },
  'accenture': {
    title: 'Accenture Salesforce Prep',
    subtitle: 'Focus on Global Delivery Model and Scalable Frameworks.',
    blocks: [
      { type: 'section', title: 'Scalable Development' },
      { type: 'qa', question: 'Why is a Trigger Framework mandatory in Accenture projects?', answer: '<p class="ans-p">Accenture utilizes frameworks like <b>fflib</b> or custom <b>Trigger Handlers</b> to ensure:</p><ul class="ans-list"><li><b>One Trigger Per Object:</b> Prevents unpredictable order of execution issues.</li><li><b>Recursion Control:</b> Uses static sets or boolean flags to prevent infinite loops.</li><li><b>Separation of Concerns:</b> Trigger only handles routing; business logic lives in Service or Domain classes.</li></ul>' },
      { type: 'qa', question: 'How to manage multi-org deployments using Unlocked Packages?', answer: '<p class="ans-p">Unlocked packages allow for modular development. We define dependencies in <code>sfdx-project.json</code> and use the <code>sf package version create</code> command. This ensures that changes in "Core Security" don\'t break "Regional Sales" modules unless explicitly updated.</p>' },
      { type: 'section', title: 'April 2026 Interview Updates' },
      { type: 'qa', question: 'LWC Lifecycle: How to capture child component data in the parent?', answer: '<p class="ans-p">Use <b>Custom Events</b>. The child dispatches an event using <code>this.dispatchEvent(new CustomEvent(\'myevent\', { detail: data }))</code>. The parent listens for it in the HTML using <code>onmyevent={handleEvent}</code>. For deep nesting, use <code>bubbles: true</code> and <code>composed: true</code>.</p>' },
      { type: 'qa', question: 'Scenario: Implement a progress bar for a 5-minute external API call.', answer: '<p class="ans-p">Since an HTTP callout cannot stay open for 5 minutes (timeout is 120s), we use a <b>Polling or Callback pattern</b>:</p><ol class="ans-list"><li><b>Initiate:</b> Apex calls the API, gets a "Job ID", and returns it to LWC.</li><li><b>Poll:</b> LWC uses <code>setInterval</code> to call another Apex method every 5-10 seconds to check the status of that Job ID.</li><li><b>Progress:</b> As the status updates (e.g., 20%, 50%), the LWC updates a <code>lightning-progress-bar</code>.</li><li><b>Complete:</b> Once status is "Success", clear the interval and show a toast message.</li></ol>' }
    ]
  },
  'fde_ag_concept': {
    title: 'FDE Prep - Agentforce Core',
    subtitle: 'Architectural concepts for AI Specialists.',
    blocks: [
      { type: 'section', title: 'Agentforce Architecture' },
      { type: 'qa', question: 'What are the 5 core components of Agentforce?', answer: '<p class="ans-p"><b>1. Agent:</b> The AI persona/role. <b>2. Topics:</b> Task categories. <b>3. Actions:</b> Executable logic (Flow, Apex, etc.). <b>4. Atlas:</b> The reasoning engine. <b>5. Trust Layer:</b> Security and PII masking.</p>' },
      { type: 'qa', question: 'What is the ReAct pattern in Atlas?', answer: '<p class="ans-p"><b>Reason + Act.</b> The engine reasons about the user intent, decides on an action, executes it, observes the result, and loops until the final response is generated.</p>' },
      { type: 'qa', question: 'Dynamic Grounding vs. Hallucination.', answer: '<p class="ans-p">Grounding is the process of injecting real Salesforce record data into the prompt at runtime (RAG). This ensures the LLM answers based on facts, preventing it from making up information (hallucination).</p>' }
    ]
  },
  'fde_ag_scenario': {
    title: 'FDE Prep - Agentforce Scenarios',
    subtitle: 'Practical design and debugging challenges.',
    blocks: [
      { type: 'section', title: 'Design & Debugging' },
      { type: 'qa', question: 'Scenario: Agent gives wrong product eligibility answers. Debug steps?', answer: '<p class="ans-p">1. Check <b>Conversation Simulator</b> logs. 2. Verify <b>Grounding Data</b> was correctly retrieved. 3. Review <b>Prompt Template</b> instructions for ambiguity. 4. Add <b>negative instructions</b> to the topic guardrails.</p>' },
      { type: 'qa', question: 'How to make Agentforce compliant in Mortgage?', answer: '<p class="ans-p">Enable <b>PII Masking</b> in the Trust Layer. Add <b>hard escalation rules</b> for TRID-sensitive keywords (e.g., "rate quote"). Use <b>System Prompts</b> to forbid legal advice.</p>' }
    ]
  },
  'fde_dc_concept': {
    title: 'FDE Prep - Data Cloud Core',
    subtitle: 'Unified profile and data orchestration.',
    blocks: [
      { type: 'section', title: 'Data Cloud Lifecycle' },
      { type: 'qa', question: 'Explain the Data Cloud lifecycle.', answer: '<p class="ans-p"><b>Ingest</b> (DLO) -> <b>Map</b> (DMO) -> <b>Resolve</b> (Unified Individual) -> <b>Insights</b> (Metrics) -> <b>Segment</b> (Audience) -> <b>Activate</b> (Destination).</p>' },
      { type: 'qa', question: 'What is a Unified Individual?', answer: '<p class="ans-p">A master 360-degree profile created by <b>Identity Resolution</b> match rules. It links records from multiple systems (CRM, Web, Legacy) without destroying source data.</p>' }
    ]
  },
  'fde_dc_adv': {
    title: 'FDE Prep - Data Cloud Advanced',
    subtitle: 'Large scale orchestration and AI grounding.',
    blocks: [
      { type: 'section', title: 'Performance & AI' },
      { type: 'qa', question: 'What are Data Graphs and why use them for Agentforce?', answer: '<p class="ans-p">Data Graphs are <b>pre-joined, materialized views</b> of related records. They provide sub-second data retrieval for agent grounding, ensuring the AI has the full context without multiple slow SOQL queries.</p>' },
      { type: 'qa', question: 'Explain Zero Copy Partner Network.', answer: '<p class="ans-p">Allows Data Cloud to query data in-place from external warehouses like <b>Snowflake</b> or <b>BigQuery</b> without physically copying the data, reducing cost and latency.</p>' }
    ]
  },
  'fde_cheat': {
    title: 'FDE Cheat Sheet',
    subtitle: 'Rapid-fire definitions and power phrases.',
    blocks: [
      { type: 'section', title: 'Rapid-Fire Definitions' },
      { type: 'qa', question: 'Atlas vs. Trust Layer', answer: '<p class="ans-p"><b>Atlas:</b> The brain (thinking/planning). <b>Trust Layer:</b> The shield (PII masking/security).</p>' },
      { type: 'qa', question: 'DLO vs. DMO', answer: '<p class="ans-p"><b>DLO (Data Lake Object):</b> Raw incoming data. <b>DMO (Data Model Object):</b> Clean, mapped data in the standard model.</p>' },
      { type: 'section', title: 'Power Phrases' },
      { type: 'qa', question: 'How to sound like a Senior FDE?', answer: '<p class="ans-p">"Grounding is the foundation of accuracy; without it, you just have a generic chatbot."<br>"I separate read-only topics from write topics to manage risk profiles."<br>"Topic descriptions matter more than prompt engineering because Atlas routes before the LLM fires."</p>' }
    ]
  },
  // --- MASTER TECHNICAL MODULES ---
  'security_5_layers': {
    title: 'Salesforce 5 Layers of Security',
    subtitle: 'Complete breakdown of the Salesforce Security Model.',
    blocks: [
      { type: 'section', title: 'The Security Gates' },
      { type: 'qa', question: 'Layer 1: Organization Level Security?', answer: '<p class="ans-p">The first line of defense. Controls WHO can login and WHEN:</p><ul class="ans-list"><li><b>Login IP Ranges:</b> Restricts access to specific network addresses (Trusted IPs).</li><li><b>Login Hours:</b> Restricts access based on time of day (e.g., 9-5 only).</li><li><b>Password Policies:</b> Complexity, history, and lockout periods.</li></ul>' },
      { type: 'qa', question: 'Layer 2: Object Level Security (CRUD)?', answer: '<p class="ans-p">Controls WHAT objects a user can see and modify. Managed via <b>Profiles</b> (baseline) and <b>Permission Sets</b> (additive). Permissions include Create, Read, Edit, Delete, View All, and Modify All.</p>' },
      { type: 'qa', question: 'Layer 3: Field Level Security (FLS)?', answer: '<p class="ans-p">Controls which fields are visible/editable even if the user has object access. This is the <b>strongest</b> way to protect PII data. If a field is hidden via FLS, it cannot be seen in reports, search, or via API.</p>' },
      { type: 'qa', question: 'Layer 4: Record Level (OWD)?', answer: '<p class="ans-p">Organization-Wide Defaults set the <b>base level</b> of access for records a user does NOT own. Options: Private, Public Read Only, Public Read/Write. You should always start with <b>Private</b> and open access up.</p>' },
      { type: 'qa', question: 'Layer 5: Record Level (Sharing)?', answer: '<p class="ans-p">Opening up access beyond OWD. Methods include:</p><ul class="ans-list"><li><b>Role Hierarchy:</b> Managers see what their subordinates see.</li><li><b>Sharing Rules:</b> Criteria-based or Owner-based sharing.</li><li><b>Manual Sharing:</b> One-off sharing by record owners.</li><li><b>Apex Sharing:</b> Programmatic sharing for complex logic.</li></ul>' }
    ]
  },
  'order_of_execution': {
    title: 'Order of Execution (Master Class)',
    subtitle: 'The sub-second sequence of events when saving a record.',
    blocks: [
      { type: 'section', title: 'The 20-Step Sequence' },
      { type: 'qa', question: 'Explain the 20 steps of Salesforce Order of Execution in order.', answer: '<p class="ans-p">When a record is saved, Salesforce follows this strict sequence:</p><ol class="ans-list"><li><b>Initialize:</b> Loads original record from DB (if update).</li><li><b>Overwrite:</b> Overwrites old values with new values from request.</li><li><b>System Validation:</b> Checks required fields, data types, and field lengths.</li><li><b>Before-Save Flow:</b> Executes Record-Triggered Flows configured to run "Before the record is saved".</li><li><b>Before Triggers:</b> Executes all <code>before insert</code> or <code>before update</code> triggers.</li><li><b>Custom Validation:</b> Executes custom Validation Rules.</li><li><b>Duplicate Rules:</b> Checks for duplicate records.</li><li><b>Save:</b> Saves the record to the database (but does not commit).</li><li><b>After Triggers:</b> Executes all <code>after insert</code> or <code>after update</code> triggers.</li><li><b>Assignment Rules:</b> Executes Case or Lead assignment rules.</li><li><b>Auto-Response:</b> Executes auto-response rules.</li><li><b>Workflow:</b> Executes Workflow rules (Field updates, Tasks, Emails).</li><li><b>Workflow Re-execution:</b> If workflow updated a field, Before/After triggers fire ONE MORE TIME (but only once).</li><li><b>Escalation Rules:</b> Executes Case escalation rules.</li><li><b>After-Save Flow:</b> Executes Record-Triggered Flows (After-Save) and Process Builders.</li><li><b>Entitlements:</b> Executes entitlement processes.</li><li><b>Roll-up Summary:</b> Calculates roll-up summary fields and updates parent records.</li><li><b>Sharing:</b> Evaluates Criteria-Based Sharing.</li><li><b>Commit:</b> Commits all DML operations to the database.</li><li><b>Post-Commit:</b> Executes logic after commit (Email Alerts, Outbound Messages).</li></ol>' },
      { type: 'qa', question: 'What is the "Recursive Trigger" trap in the Order of Execution?', answer: '<p class="ans-p">If a workflow rule (Step 12) performs a field update, it causes the <b>Before and After triggers</b> to fire again. If your trigger logic performs another update without a static boolean flag to check "isExecuting", you can enter an infinite loop, eventually hitting the limit of 16 recursions or governor limits.</p>' },
      { type: 'qa', question: 'Why use Before-Save Flow (Step 4) instead of Before Trigger (Step 5)?', answer: '<p class="ans-p">Before-Save Flows are up to <b>10x faster</b> than Process Builder or Workflow and don\'t require extra DML. They should be used for simple same-record field updates. Before Triggers should be reserved for complex logic that requires Apex (e.g., calling a Service class or complex collections logic).</p>' }
    ]
  },
  'flow_master': {
    title: 'Salesforce Flow Master Class',
    subtitle: 'Advanced design patterns and error handling.',
    blocks: [
      { type: 'section', title: 'Automation Strategy' },
      { type: 'qa', question: 'How to handle "Mixed DML" errors in Flow?', answer: '<p class="ans-p">Mixed DML occurs when updating Setup (User) and Non-Setup (Account) objects in one transaction. Fix: Use an <b>Action element</b> with "Pause" or call an <b>Async Apex</b> action to separate the transactions.</p>' },
      { type: 'qa', question: 'What is a "Fault Path" and why use it?', answer: '<p class="ans-p">A Fault Path allows you to handle unexpected errors gracefully. Instead of the user seeing "An unhandled fault has occurred", you can log the error to a custom object, send a Slack alert, or show a friendly screen message.</p>' }
    ]
  },
  'sales_cloud': {
    title: 'Sales Cloud Architecture',
    subtitle: 'Mastering the Lead-to-Cash lifecycle and Sales productivity.',
    blocks: [
      { type: 'section', title: 'Sales Pipeline & Productivity' },
      { type: 'qa', question: 'How do you handle Multi-Currency and Advanced Currency Management (ACM)?', answer: '<p class="ans-p">Enable Multi-Currency in Company Information. <b>ACM</b> allows you to manage dated exchange rates within Opportunities. Note: ACM does NOT apply to custom objects or roll-up summaries; for those, you need custom Apex logic or third-party tools.</p>' },
      { type: 'qa', question: 'Explain the Opportunity Split feature.', answer: '<p class="ans-p">Opportunity Splits allow multiple team members to share credit for an Opportunity. <b>Revenue Splits</b> must total 100%, while <b>Overlay Splits</b> can total any percentage. Both rely on Opportunity Teams being enabled.</p>' },
      { type: 'qa', question: 'What is Collaborative Forecasting?', answer: '<p class="ans-p">A tool to predict sales based on the Opportunity pipeline. It supports various forecast types (Revenue, Quantity, Product Families) and allows for adjustments by managers to provide a "best-case" estimate.</p>' },
      { type: 'qa', question: 'Scenario: How to automate Sales Territory assignment?', answer: '<p class="ans-p">Use <b>Enterprise Territory Management (ETM)</b>. You define Territory Types, Models, and Assignment Rules based on Account fields (e.g., Billing State, Industry). Accounts are assigned to territories, and Opportunities inherit the territory from the Account.</p>' }
    ]
  },
  'service_cloud': {
    title: 'Service Cloud Architecture',
    subtitle: 'High-performance support, Omni-channel, and KCS.',
    blocks: [
      { type: 'section', title: 'Service Excellence & Knowledge' },
      { type: 'qa', question: 'What is Knowledge Centered Service (KCS) in Salesforce?', answer: '<p class="ans-p">KCS involves capturing knowledge during the support process. Agents can search the <b>Knowledge Base</b>, attach articles to cases, and "Promote to Article" from a Case comment. This requires <b>Knowledge User</b> licenses and Article Type configurations.</p>' },
      { type: 'qa', question: 'Omni-Channel: Capacity vs. Weight?', answer: '<p class="ans-p"><b>Capacity:</b> The total work an agent can handle (e.g., 100 units). <b>Weight:</b> The "cost" of a specific work item (e.g., a Chat = 20 units, a Case = 50 units). Omni-Channel routes work until the agent\'s total weight reaches their capacity.</p>' },
      { type: 'qa', question: 'How to implement "Follow-the-Sun" support?', answer: '<p class="ans-p">Use <b>Business Hours</b> and <b>Holiday</b> settings combined with <b>Case Assignment Rules</b> or Omni-Channel. Rules check the current time and route the case to the queue active in that specific time zone (e.g., APAC, EMEA, US).</p>' },
      { type: 'qa', question: 'What is the Service Console and why use it?', answer: '<p class="ans-p">A workspace designed for high-volume agents. Features include <b>Workspace Tabs</b> (sub-tabs for related records), <b>Softphone integration</b>, <b>Macros</b> for repetitive tasks, and the <b>Utility Bar</b> for quick access to tools like History or Notes.</p>' }
    ]
  },
  'experience_cloud': {
    title: 'Experience Cloud (Communities)',
    subtitle: 'Building secure and performant portals for Partners & Customers.',
    blocks: [
      { type: 'section', title: 'Portal Architecture & Security' },
      { type: 'qa', question: 'Difference between Customer Community vs. Partner Community licenses?', answer: '<p class="ans-p"><b>Customer Community:</b> High volume, limited access (no Leads, Opportunities, or Campaigns). <b>Partner Community:</b> Full access to Sales objects (Leads, Deals, MDF) and supports <b>Advanced Sharing</b> (Share Groups/Apex Sharing).</p>' },
      { type: 'qa', question: 'How to manage Brand Consistency across multiple Communities?', answer: '<p class="ans-p">Use the <b>Experience Builder Theme</b>. Define global colors, fonts, and CSS. For cross-community reuse, package your brand as a <b>Lightning Bolt Template</b> or use a shared <b>LWC Design System</b>.</p>' },
      { type: 'qa', question: 'What is a "Share Group" in Experience Cloud?', answer: '<p class="ans-p">Share Groups are used with <b>Customer Community Plus</b> or <b>Partner</b> licenses to share records owned by community users with internal users. Since community users don\'t exist in the standard Role Hierarchy, Share Groups bridge that gap.</p>' },
      { type: 'qa', question: 'How to optimize Community performance?', answer: '<p class="ans-p">Use the <b>Salesforce CDN</b> (Content Delivery Network), minimize the use of heavy images, leverage <b>LWC</b> instead of Aura, and ensure SOQL queries used in community components are highly optimized with indexes.</p>' }
    ]
  }
};



// =============================================
// AUTHENTICATION (Google OAuth2)
// =============================================
window.processGAuth = async function(response) {
  const token = response.credential;
  localStorage.setItem('google_auth_token', token);
  GSI_TOKEN = token;
  
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      // Force hide the overlay immediately
      document.getElementById('loginOverlay').style.display = 'none';
      console.log('Login Success! Showing Dashboard for:', currentUser.name);
      
      // Load data in background
      renderUserProfile(currentUser);
      syncDashboard();
    } else {
      alert('Login failed: ' + data.error);
    }
  } catch (e) {
    // Only log real errors, ignore browser blocks (ad-blockers)
    if (e.message && e.message.includes('BLOCKED_BY_CLIENT')) return;
    console.error('Auth Error:', e);
  }
};

// Check for pending auth from proxy
if (window._pendingGAuth) {
  window.processGAuth(window._pendingGAuth);
}

function generateInitialsAvatar(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 120, 120);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(60, 60, 60, 0, Math.PI * 2);
  ctx.fill();
  
  // Initials text
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2 
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, 60, 62);
  
  return canvas.toDataURL('image/png');
}

function renderUserProfile(user) {
  if (!user) return;
  
  // Neural-Sync Header Profile (v1348)
  const container = document.getElementById('floatingProfileContainer');
  const avatarImg = document.getElementById('floatAvatarImg');
  const dropName = document.getElementById('floatFullTitle');
  const dropEmail = document.getElementById('floatEmailTitle');
  
  // Sidebar elements (for backwards compatibility)
  const sidebarPic = document.getElementById('userPicture');
  const sidebarName = document.getElementById('userName');
  const sidebarEmail = document.getElementById('userEmail');
  const sidebarWrap = document.getElementById('userProfile');

  // High-Res Image Logic
  let profilePic = user.picture;
  if (profilePic && profilePic.includes('googleusercontent.com')) {
    profilePic = profilePic.replace(/=s\d+-c/, '=s120-c');
  }

  // Update Header Pill
  if (container) container.style.display = 'block';
  if (avatarImg) {
    avatarImg.src = profilePic || generateInitialsAvatar(user.name);
    avatarImg.onerror = function() { this.src = generateInitialsAvatar(user.name); };
  }
  
  // Update Dropdown
  if (dropName) dropName.textContent = user.name;
  if (dropEmail) dropEmail.textContent = user.email;

  // Update Sidebar
  if (sidebarWrap) sidebarWrap.style.display = 'flex';
  if (sidebarPic) sidebarPic.src = profilePic || generateInitialsAvatar(user.name);
  if (sidebarName) sidebarName.textContent = user.name;
  if (sidebarEmail) sidebarEmail.textContent = user.email;

  // Global Refresh for Streaks
  renderStreakBadge();
}

function toggleFloatingDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('floatDropdownMenu');
  if (!menu) return;
  const isVisible = menu.style.display === 'flex';
  menu.style.display = isVisible ? 'none' : 'flex';
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
  const menu = document.getElementById('floatDropdownMenu');
  if (menu) menu.style.display = 'none';
});

function signOut() {
  localStorage.removeItem('google_auth_token');
  location.reload();
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('google_auth_token');
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  return fetch(url, { ...options, headers });
}

window.syncProfile = async function(platform) {
  const isCloud = window.location.hostname !== 'localhost';
  
  if (isCloud) {
    if (platform === 'LinkedIn') {
      // OPEN IN NEW TAB with Secure Token Handshake
      window.open(`/linkedin-login.html?token=${GSI_TOKEN}`, '_blank');
      return;
    }
    if (platform === 'Naukri') {
      // OPEN IN NEW TAB with Secure Token Handshake
      window.open(`/naukri-login.html?token=${GSI_TOKEN}`, '_blank');
      return;
    }
  }

  // --- LOCAL FALLBACK (Legacy) ---
  const btnL = document.getElementById('btnSyncLinkedIn');
  const btnN = document.getElementById('btnSyncNaukri');
  const statusEl = document.getElementById('profileSyncStatus');
  
  const originalHtmlL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> Sync & Analyze';
  const originalHtmlN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> Sync & Analyze';

  if (platform === 'LinkedIn' && btnL) { 
    btnL.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> Analyzing Profile...'; 
    btnL.style.background = 'var(--blue)';
    btnL.style.opacity = '0.9'; 
  }
  if (platform === 'Naukri' && btnN) { 
    btnN.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> Scanning Resume...'; 
    btnN.style.background = '#ff7555';
    btnN.style.opacity = '0.9'; 
  }

  try {
    const localBase = 'http://localhost:3000';
    const syncRes = await fetch(localBase + '/api/profile/sync', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GSI_TOKEN
      },
      body: JSON.stringify({ platform })
    });
    const syncData = await syncRes.json();
    
    if (syncData.success) {
      let profilePayload = null;
      try {
        const cacheRes = await fetch('/.cache/profile-sync.json?cb=' + Date.now());
        if (cacheRes.ok) profilePayload = await cacheRes.json();
      } catch(e) {}

      if (profilePayload) {
        await apiFetch('/api/profile/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profilePayload)
        });
      }

      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = 'OK ' + platform + ' profile synced & saved to cloud';
        setTimeout(function() { statusEl.style.display = 'none'; }, 8000);
      }
      await loadUserProfile();
      showPage('profile_match');
    } else {
      alert('Sync Failed: ' + (syncData.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Local sync failed or timed out', e);
  }
  
  // Restore button states
  if (btnL) { 
    btnL.innerHTML = originalHtmlL;
    btnL.style.opacity = '1'; 
    btnL.style.background = ''; // Use CSS default
  }
  if (btnN) { 
    btnN.innerHTML = originalHtmlN;
    btnN.style.opacity = '1'; 
    btnN.style.background = ''; // Use CSS default
  }
};

// =============================================
// PROFILE DATA MANAGEMENT
// =============================================
let cachedUserProfile = null;

async function loadUserProfile() {
  try {
    // CACHE-BUST: Ensure we get fresh synced flags from the cloud
    const res = await apiFetch('/api/profile/data?cb=' + Date.now());
    if (!res.ok) {
      console.log('â Œ [Profile] Cloud fetch failed (Status: ' + res.status + '). User might be logged out.');
      return;
    }
    const data = await res.json();
    console.log('ðŸ“¦ [Profile] Cloud Data Received:', data);
    
    if (data.exists && data.profile) {
      cachedUserProfile = data.profile;
      
      // Update All UI Components
      const matchBtn = document.getElementById('btnViewProfileMatch');
      if (matchBtn) matchBtn.style.display = 'block';
      
      renderProfileMatchPage(data.profile);
      updateSidebarProfileStatus(data.profile);
      updateSyncModalUI(data.profile);

      // Cloud Sync Streaks & Bookmarks (v1356 - Master MongoDB)
      if (data.profile.studyStreak) {
        studyStreak = data.profile.studyStreak;
        renderStreakBadge();
      }
      if (data.profile.bookmarks) {
        userBookmarks = data.profile.bookmarks;
        console.log('â­ [BOOKMARKS] Total Loaded:', userBookmarks.length);
        if (userBookmarks.length > 0) {
          console.table(userBookmarks.map(b => ({ Question: b.q, Topic: b.topic })));
        }
        renderBookmarkButtons();
        const countEl = document.getElementById('bookmarkCount');
        if (countEl) countEl.textContent = userBookmarks.length;

        // If user is on bookmarks page, force a redraw now that data is here
        const activeTab = localStorage.getItem('last_active_tab');
        if (activeTab === 'bookmarks_page' || (document.getElementById('bookmarks_page') && document.getElementById('bookmarks_page').classList.contains('active'))) {
          showBookmarks();
        }
      }
      // Cloud Sync Retention (v1356 - Master MongoDB)
      if (data.profile.studyPlanTopics) {
        userRetention = {}; // Reset local to match Cloud Truth
        data.profile.studyPlanTopics.forEach(t => {
          if (t.nextReview) {
            userRetention[t.topicId] = {
              confidence: t.confidence,
              nextReview: t.nextReview,
              interval: t.interval,
              easeFactor: t.easeFactor
            };
          }
        });
        renderRevisionAlerts();
      }
    }
  } catch (e) { console.log('[Profile] Cloud profile fetch failed or unavailable.'); }
}

function renderProfileMatchPage(profile) {
  const contentDiv = document.getElementById('profileMatchContent');
  const syncCta = document.getElementById('syncCtaCards');
  if (!contentDiv) return;

  // Sync Sidebar Status
  updateSidebarProfileStatus(profile);
  
  // REAL-TIME: Update Sync Modal if it's open
  updateSyncModalUI(profile);

  // Hide large sync cards if profile exists to give "Success" feel
  if (syncCta) syncCta.style.display = 'none';

  const skills = profile.skills || [];
  const certs = profile.certifications || [];
  const missing = profile.missingSkills || [];
  const topics = profile.studyPlanTopics || [];
  const platforms = profile.platforms || {};
  const strength = updateProfileStrengthMeter(skills.length, missing.length);

  var syncBadges = '';
  if (platforms.linkedin && platforms.linkedin.synced) {
    syncBadges += '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(0,119,181,0.12);border:1px solid rgba(0,119,181,0.25);border-radius:20px;font-size:0.68rem;color:#60a5fa;">LinkedIn Synced</span> ';
  }
  if (platforms.naukri && platforms.naukri.synced) {
    syncBadges += '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,117,85,0.12);border:1px solid rgba(255,117,85,0.25);border-radius:20px;font-size:0.68rem;color:#fb923c;">Naukri Synced</span>';
  }

  var html = '<div class="content-card">';

  // NEW: Premium AI Career Insight Card
  html += `
    <div class="content-card" style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.1)); border:1px solid rgba(59,130,246,0.2); border-radius:16px; padding:20px; margin-bottom:24px; position:relative; overflow:hidden;">
      <div style="position:absolute; right:-10px; top:-10px; opacity:0.1; transform:rotate(15deg); color:var(--blue);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:80px;height:80px;"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <div style="font-size:0.65rem; color:var(--blue); font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;">INDUSTRIAL PROFILE SUMMARY</div>
          <div style="font-size:1.4rem; font-weight:800; color:var(--text);">Career Readiness: ${strength > 80 ? 'Exceptional' : strength > 50 ? 'Strong' : 'Developing'}</div>
        </div>
        <button onclick="document.getElementById('syncCtaCards').style.display='grid'" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:6px 12px; color:var(--muted); font-size:0.65rem; font-weight:600; cursor:pointer;">Update Profile</button>
      </div>
      <p style="font-size:0.85rem; color:rgba(255,255,255,0.8); line-height:1.6; margin:0;">
        Your profile successfully aggregates data from <b>${Object.values(platforms || {}).filter(p => p.synced).length}</b> platforms. 
        We have identified <b>${skills.length} core competencies</b> and <b>${missing.length} strategic gaps</b>. 
        Our AI suggests focusing on ${missing.slice(0,2).join(' and ') || 'specialized certifications'} to reach 100% readiness.
      </p>
    </div>
  `;

  // Strength Meter & Profile Summary
  html += `
    <div class="profile-grid content-card">
      <div style="display:flex; align-items:center; gap:15px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; min-width:0; overflow:hidden;">
        <div style="position:relative; width:64px; height:64px; flex-shrink:0;">
          <svg viewBox="0 0 36 36" style="width:100%; height:100%; transform: rotate(-90deg);">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="3" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--blue)" stroke-width="3" stroke-dasharray="${strength}, 100" />
          </svg>
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-weight:800; font-size:0.9rem; color:var(--text);">${strength}%</div>
        </div>
        <div>
          <div style="font-weight:700; color:var(--text); font-size:0.85rem;">Ready for ${profile.targetRole || 'Salesforce Developer'}</div>
          <div style="font-size:0.65rem; color:var(--muted); margin-top:2px;">Target Achievement</div>
        </div>
      </div>
      
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; display:flex; align-items:center; justify-content:space-between; min-width:0; overflow:hidden;">
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:1.1rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${profile.currentRole || 'Salesforce Professional'}</div>
          <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">${profile.experienceYears || 0} Years Exp &bull; ${certs.length} Certs</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0;">
          ${syncBadges}
        </div>
      </div>
    </div>
  `;

  // Skills Grid
  html += '<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:0.9rem;color:var(--text);margin-bottom:10px; display:flex; align-items:center; gap:8px;">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--pink);"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.04-2.44V7.5A2.5 2.5 0 0 1 7.5 5h2z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.04-2.44V7.5A2.5 2.5 0 0 0 16.5 5h-2z"></path></svg>' +
    'Your Skills (' + skills.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:6px;">';
  skills.forEach(function(s) {
    html += '<span style="padding:5px 12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:20px;font-size:0.72rem;color:#60a5fa;font-weight:500;">' + s + '</span>';
  });
  html += '</div></div>';

  // Skill Gaps
  if (missing.length > 0) {
    html += '<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:0.9rem;color:var(--text);margin-bottom:10px; display:flex; align-items:center; gap:8px;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--amber);"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>' +
      'Identified Skill Gaps (' + missing.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:6px;">';
    missing.forEach(function(s) {
      html += '<span style="padding:5px 12px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.2);border-radius:20px;font-size:0.72rem;color:#fb923c;font-weight:500; display:flex; align-items:center; gap:6px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:10px;height:10px;"><polyline points="18 15 12 9 6 15"></polyline></svg>' + s + '</span>';
    });
    html += '</div></div>';
  }

  // Study Topics
  if (topics.length > 0) {
    html += '<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:0.9rem;color:var(--text);margin-bottom:10px; display:flex; align-items:center; gap:8px;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--blue);"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 20H20v2H6.5A2.5 2.5 0 0 1 4 17.5v-15A2.5 2.5 0 0 1 6.5 0z"></path></svg>' +
      'AI Recommended Study Topics</div>';
    html += '<div class="universal-grid">';
    console.log('[AI Debug] Study Roadmap Topics:', topics);
    topics.forEach(function(t) {
      // HEURISTIC EXTRACTOR (v1372)
      function extractIndustrialTopicName(obj) {
        if (typeof obj === 'string') return obj;
        const keys = ['topic', 'name', 'title', 'id', 'label', 'subject', 'topicName', 'key', 'header', 'content', 'concept', 'skill', 'roadmap_item', 'suggestion', 'area', 'focus'];
        for (let k of keys) { if (obj[k] && typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim(); }
        // Heuristic: Take first string property between 3 and 50 chars
        for (let k in obj) { if (typeof obj[k] === 'string' && obj[k].trim().length >= 3 && obj[k].trim().length <= 60) return obj[k].trim(); }
        return null;
      }

      var topicName = extractIndustrialTopicName(t) || 'Career Specialization';
      var priorityColors = { critical: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#ef4444' }, high: { bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)', text: '#fb923c' }, medium: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#60a5fa' } };
      
      // Robust priority mapping
      var rawPriority = (t.priority || t.level || t.importance || t.priority_level || 'medium').toLowerCase();
      var pc = priorityColors[rawPriority] || priorityColors.medium;
      
      var topicId = t.topicId || (typeof topicName === 'string' ? topicName.toLowerCase().replace(/\s+/g, '_') : 'unknown_topic');
      var hasTimerPage = !!document.getElementById(topicId) || !!topicConfig[topicId];
      var estHours = t.estimatedHours || t.hours || t.est || t.time || 0;
      html += '<div onclick="showPage(\'' + topicId + '\')" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;" onmouseenter="this.style.borderColor=\'var(--blue)\'" onmouseleave="this.style.borderColor=\'var(--border)\'">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-weight:600;font-size:0.85rem;color:var(--text);">' + topicName + '</span>';
      html += '<span style="font-size:0.6rem;padding:2px 8px;background:' + pc.bg + ';border:1px solid ' + pc.border + ';border-radius:12px;color:' + pc.text + ';font-weight:700;text-transform:uppercase;">' + (t.priority || rawPriority) + '</span></div>';
      html += '<div style="font-size:0.72rem;color:var(--muted);line-height:1.5;margin-bottom:8px;">' + (t.reason || t.desc || t.description || t.why || '') + '</div>';
      html += '<div style="font-size:0.68rem;color:var(--dim);display:flex;justify-content:space-between; align-items:center;">' +
        '<span style="display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ' + estHours + 'h estimated</span>' +
        '<span style="color:var(--blue); display:flex; align-items:center; gap:4px;">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;"><path d="M5 3l14 9-14 9V3z"></path></svg> Start Prep ' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span></div></div>';
    });
    html += '</div></div>';
  }

  // AI Study Plan (Markdown)
  if (profile.studyPlan) {
    html += '<div style="margin-top:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:var(--blue);"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>' +
      '<span style="font-weight:700;font-size:1rem;color:var(--text);">Full AI Study Roadmap</span>';
    html += '<span style="font-size:0.6rem;padding:3px 8px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.25);border-radius:20px;color:#c4b5fd;margin-left:auto;">Gemma 4</span></div>';
    html += '<div style="font-size:0.82rem;line-height:1.8;color:var(--muted);">' + (window.marked ? marked.parse(profile.studyPlan) : profile.studyPlan) + '</div></div>';
  }

  html += '</div>'; // close content-card
  contentDiv.innerHTML = html;
}

function updateProfileStrengthMeter(skillCount, gapCount) {
  if (skillCount === 0 && gapCount === 0) return 0;
  const total = skillCount + gapCount;
  return Math.round((skillCount / total) * 100);
}

async function generateDynamicQA(topicId) {
  const btn = document.getElementById('btnGenerateTopicQA');
  const content = document.getElementById('topicViewerContent');
  const qaContainer = document.getElementById('topicQAContainer');
  const topicName = topicConfig[topicId] ? topicConfig[topicId].name : topicId;

  btn.disabled = true;
  btn.textContent = 'Gemma 4 is generating Q&A...';
  
  try {
    const prompt = `You are a Senior Salesforce Interviewer. Generate 5 highly technical and scenario-based interview questions for the topic: "${topicName}". 
For each question, provide a detailed "Master Answer" that would impress a hiring manager. 
Format your response as a valid JSON array of objects: [{"question": "...", "answer": "..."}]. 
Do not include any conversational text before or after the JSON.`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:e4b',
        prompt: prompt,
        stream: false
      })
    });
    
    if (!res.ok) throw new Error('Ollama not responding');
    const data = await res.json();
    
    // Parse JSON from response
    let qa = [];
    try {
      const jsonStr = data.response.substring(data.response.indexOf('['), data.response.lastIndexOf(']') + 1);
      qa = JSON.parse(jsonStr);
    } catch(e) {
      // Fallback if not JSON
      qa = [{ question: "Topic: " + topicName, answer: data.response }];
    }

    content.style.display = 'none';
    qaContainer.style.display = 'block';
    qaContainer.innerHTML = qa.map((item, idx) => `
      <div class="qa-block" style="margin-bottom:15px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;">
        <div class="qa-question" onclick="toggleQA(this)" style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
          <span class="qa-q-text" style="font-weight:700; font-size:0.9rem; color:var(--text);">${idx + 1}. ${item.question}</span>
          <span class="qa-chevron">v</span>
        </div>
        <div class="qa-answer" style="padding:0 15px 15px; font-size:0.85rem; color:rgba(255,255,255,0.8); line-height:1.6;">
          ${item.answer.replace(/\n/g, '<br>')}
        </div>
      </div>
    `).join('');
    
  } catch (e) {
    alert('Failed to generate AI Q&A. Ensure Ollama is running.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate AI Interview Q&A';
  }
}
// =============================================
// DYNAMIC TOPIC RENDERING (v1391+)
// =============================================
function renderTopicContent(topicId) {
  const data = TOPIC_DATA[topicId];
  if (!data) return false;

  const contentEl = document.getElementById('topicViewerContent');
  const titleEl = document.getElementById('topicViewerTitle');
  const subEl = document.getElementById('topicViewerSub');
  const qaContainer = document.getElementById('topicQAContainer');
  
  if (!contentEl || !titleEl || !subEl) return false;

  titleEl.textContent = data.title;
  subEl.textContent = data.subtitle;
  contentEl.style.display = 'block';
  if (qaContainer) qaContainer.style.display = 'none';

  let html = '';
  data.blocks.forEach(block => {
    if (block.type === 'section') {
      html += `<div style="font-weight:800; font-size:0.8rem; color:var(--blue); text-transform:uppercase; letter-spacing:1px; margin:32px 0 16px;">${block.title}</div>`;
    } else if (block.type === 'qa') {
      html += `
        <div class="qa-block" style="margin-bottom:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;">
          <div class="qa-question" onclick="toggleQA(this)" style="padding:16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
            <span class="qa-q-text" style="font-weight:700; font-size:0.9rem; color:var(--text);">${block.question}</span>
            <span class="qa-chevron" style="opacity:0.3; display:flex; align-items:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
          </div>
          <div class="qa-answer" style="padding:0 16px 16px; font-size:0.85rem; color:var(--muted); line-height:1.6;">
            ${block.answer}
          </div>
        </div>
      `;
    }
  });

  contentEl.innerHTML = html;
  return true;
}


async function checkAuth() {
  const token = localStorage.getItem('google_auth_token');
  if (!token) {
    document.getElementById('loginOverlay').style.display = 'flex';
    return false;
  }
  
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    if (res.status === 401) {
      document.getElementById('loginOverlay').style.display = 'flex';
      return false;
    }

    if (!res.ok) throw new Error('Auth failed');

    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      renderUserProfile(currentUser);
      document.getElementById('loginOverlay').style.display = 'none';
      return true;
    }
  } catch (e) {
    console.warn('Auth check silent failure, showing login only if truly unauthenticated');
  }
  
  // If we reach here, the token is likely invalid
  // But we only show the overlay if we are CERTAIN it's a 401/403
  return false; 
}
var floatingTimerInterval = null;

// ALL topic IDs mapped - no duplicates
var topicConfig = {
  // Daily Plan (No timers needed here)
  'schedule': { name: 'Daily Schedule', recommended: 15, group: 'General', noTimer: true },
  'job_radar': { name: 'Job Radar Dashboard', recommended: 30, group: 'General', noTimer: true },
  'study_tracker': { name: 'Progress Tracker', recommended: 30, group: 'General', noTimer: true },
  'study_history': { name: 'Study History', recommended: 0, group: 'General', noTimer: true },
  'profile_match': { name: 'Profile Matching', recommended: 10, group: 'General', noTimer: true },
  // Technical Interview Q&A
  'apex': { name: 'Apex Core', recommended: 120, group: 'Technical' },
  'soql': { name: 'SOQL Deep Dive', recommended: 90, group: 'Technical' },
  'async': { name: 'Async Apex', recommended: 90, group: 'Technical' },
  'triggers': { name: 'Triggers & Patterns', recommended: 90, group: 'Technical' },
  'lwc': { name: 'LWC Components', recommended: 120, group: 'Technical' },
  'aura': { name: 'Aura Components', recommended: 60, group: 'Technical' },
  'integration': { name: 'Integration & APIs', recommended: 90, group: 'Technical' },
  'security': { name: 'Security & Sharing', recommended: 90, group: 'Technical' },
  'platform': { name: 'Platform Events & CDC', recommended: 60, group: 'Technical' },
  'design': { name: 'Design Patterns', recommended: 60, group: 'Technical' },
  // Domain
  'domain': { name: 'US Mortgage Domain', recommended: 60, group: 'Domain' },
  // Advanced Technical
  'adv_apex': { name: 'Advanced Apex', recommended: 90, group: 'Technical' },
  'adv_lwc': { name: 'Advanced LWC', recommended: 90, group: 'Technical' },
  'adv_intg': { name: 'Advanced Integration', recommended: 60, group: 'Technical' },
  'admin': { name: 'Admin & Config', recommended: 60, group: 'Technical' },
  'scenario': { name: 'Scenario Questions', recommended: 90, group: 'Technical' },
  // Communication & Behavioral
  'comm30': { name: '30-Day Comm Plan', recommended: 30, group: 'Communication' },
  'speaking': { name: 'Speaking Drills', recommended: 45, group: 'Communication' },
  'mistakes': { name: 'Common Mistakes', recommended: 30, group: 'Communication' },
  'behavioral': { name: 'Behavioral Q&A', recommended: 60, group: 'Communication' },
  'comm': { name: 'Communication Scripts', recommended: 45, group: 'Communication' },
  'vocab': { name: 'Vocabulary & Phrases', recommended: 30, group: 'Communication' },
  'intro': { name: 'Self-Introduction', recommended: 45, group: 'Communication' },
  'mock': { name: 'Mock Interviews', recommended: 90, group: 'Communication' },
  // Interview Strategy
  'salary': { name: 'Salary & Negotiation', recommended: 30, group: 'Strategy' },
  'questions': { name: 'Questions to Ask', recommended: 20, group: 'Strategy' },
  // 100 Scenario Questions
  'sc_objects': { name: 'Objects & Fields Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_recordpage': { name: 'Record Page + LWC', recommended: 45, group: 'Scenarios' },
  'sc_navmixin': { name: 'NavigationMixin', recommended: 45, group: 'Scenarios' },
  'sc_validation': { name: 'Validation Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_async': { name: 'Credit Pull Flow', recommended: 45, group: 'Scenarios' },
  'sc_fileupload': { name: 'File Upload + GDrive', recommended: 45, group: 'Scenarios' },
  'sc_flow': { name: 'Flow Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_reports': { name: 'Reports & Dashboards', recommended: 45, group: 'Scenarios' },
  'sc_agentforce': { name: 'Agentforce Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_arch': { name: 'Architecture Mix', recommended: 45, group: 'Scenarios' },
  // Reference Guides
  'soql_full': { name: 'SOQL+SOSL Master', recommended: 60, group: 'Reference' },
  'security_full': { name: 'Security Full Guide', recommended: 60, group: 'Reference' },
  'agentforce_guide': { name: 'Agentforce Reference', recommended: 60, group: 'Reference' },
  'flows_guide': { name: 'Flow Complete Guide', recommended: 60, group: 'Reference' },
  'reports_guide': { name: 'Reports Full Guide', recommended: 45, group: 'Reference' },
  // English Speaking
  'eng30': { name: '30-Day Speaking Plan', recommended: 30, group: 'Communication' },
  'eng_starters': { name: '50 Sentence Starters', recommended: 20, group: 'Communication' },
  'eng_phrases': { name: 'Difficult Situations', recommended: 30, group: 'Communication' },
  // Company-Specific
  'deloitte': { name: 'Deloitte (Recent) 2026', recommended: 60, group: 'Company' },
  'accenture': { name: 'Accenture Prep (LWC+Async)', recommended: 60, group: 'Company' },
  'company_iq': { name: 'Arago & Morgan Stanley', recommended: 60, group: 'Company' },
  'mobigic_pwc': { name: 'Mobigic / PWC', recommended: 45, group: 'Company' },
  'thenken_globus': { name: 'Thenken Globus', recommended: 45, group: 'Company' },
  // FDE Interview Prep
  'fde_ag_concept': { name: 'FDE Agentforce Core', recommended: 90, group: 'FDE Prep' },
  'fde_ag_scenario': { name: 'FDE Agentforce Scenarios', recommended: 60, group: 'FDE Prep' },
  'fde_atlas': { name: 'FDE Atlas Deep Dive', recommended: 60, group: 'FDE Prep' },
  'fde_trust': { name: 'FDE Trust Layer', recommended: 60, group: 'FDE Prep' },
  'fde_dc_concept': { name: 'FDE Data Cloud Core', recommended: 90, group: 'FDE Prep' },
  'fde_dc_adv': { name: 'FDE Data Cloud Advanced', recommended: 60, group: 'FDE Prep' },
  'fde_integration': { name: 'FDE Integration', recommended: 60, group: 'FDE Prep' },
  'fde_apex': { name: 'FDE Apex in Agents', recommended: 60, group: 'FDE Prep' },
  'fde_behavioral': { name: 'FDE Behavioral', recommended: 60, group: 'FDE Prep' },
  'fde_cheat': { name: 'FDE Cheat Sheet', recommended: 30, group: 'FDE Prep' },
  // New Industrial Modules
  'security_5_layers': { name: '5 Layers Security', recommended: 90, group: 'Technical' },
  'order_of_execution': { name: 'Order of Execution', recommended: 60, group: 'Technical' },
  'flow_master': { name: 'Flow Master Class', recommended: 90, group: 'Technical' },
  'sales_cloud': { name: 'Sales Cloud Arch', recommended: 60, group: 'Technical' },
  'service_cloud': { name: 'Service Cloud Arch', recommended: 60, group: 'Technical' },
  'experience_cloud': { name: 'Experience Cloud', recommended: 60, group: 'Technical' }
};

// =============================================
// UTILS
// =============================================
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000 } = options;
  const token = localStorage.getItem('google_auth_token');
  
  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : ''
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, headers, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// =============================================
// DATA LAYER (Server-side API)
// =============================================
async function getStudyData(force = false) {
  const now = Date.now();
  if (!force && globalStudyData && (now - lastFetchTime < MIN_FETCH_INTERVAL)) {
    return globalStudyData;
  }
  
  try {
    lastFetchTime = now;
    const [historyRes, tasksRes] = await Promise.all([
      fetchWithTimeout('/api/study/history?cb=' + Date.now()),
      fetchWithTimeout('/api/study/tasks?cb=' + Date.now())
    ]);
    const sessions = await historyRes.json();
    const { completedTasks } = await tasksRes.json();
    
    const topics = {};
    (sessions || []).forEach(s => {
      const tid = s.topic || s.topicId;
      if (!tid) return;
      const duration = Number(s.duration || 0);
      if (!topics[tid]) topics[tid] = { totalSeconds: 0, sessions: 0, lastStudied: null };
      topics[tid].totalSeconds += duration;
      topics[tid].sessions += 1;
    });
    
    globalStudyData = { topics, sessions, completedTasks };
    return globalStudyData;
  } catch(e) { 
    return globalStudyData || { topics: {}, sessions: [], completedTasks: [] }; 
  }
}

async function saveSession(session) {
  try {
    await fetchWithTimeout('/api/study/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
  } catch(e) { console.error('Failed to save session', e); }
}

async function toggleTask(index) {
  try {
    const res = await fetch('/api/study/toggle-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index })
    });
    if (res.ok) await renderTimetable();
  } catch(e) { console.error('[Cloud] Toggle Error:', e); }
}

// =============================================
// TIMER with PAUSE / PLAY
// =============================================
var baseSeconds = 0;

async function startTracking(pageId) {
  const cfg = topicConfig[pageId];
  if (!cfg || cfg.noTimer) {
    var timerEl = document.getElementById('floatingTimer');
    if (timerEl) timerEl.style.display = 'none';
    return;
  }
  
  if (currentTrackedPage === pageId && !isPaused) return;
  if (currentTrackedPage && currentTrackedPage !== pageId) await stopTracking();
  
  // Show timer
  var timerEl = document.getElementById('floatingTimer');
  if (timerEl) timerEl.style.display = 'flex';

  // DUAL-SYNC RESUME: Use localStorage for instant feel + Server for persistence
  const localBase = parseInt(localStorage.getItem('timer_' + pageId) || '0');
  baseSeconds = localBase;
  
  // Update from server in background
  getStudyData().then(data => {
    if (data.topics[pageId]) {
      const serverSeconds = data.topics[pageId].totalSeconds;
      if (serverSeconds > baseSeconds) {
        baseSeconds = serverSeconds;
        updateFloatingTimer();
      }
    }
  });
  
  currentTrackedPage = pageId;
  trackingStartTime = Date.now();
  isPaused = false;
  pausedElapsed = 0;
  
  updateFloatingTimer();
  startFloatingTimerInterval();
  
  // AUTO-OPEN LAST QUESTION
  restoreLastQuestion(pageId);
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  if (activeEl) activeEl.textContent = topicConfig[pageId].name;
  if (lightEl) lightEl.style.display = 'inline-block';
}

function restoreLastQuestion(pageId) {
  const lastQ = localStorage.getItem('last_q_' + pageId);
  if (!lastQ) return;
  
  const page = document.getElementById(pageId);
  if (!page) return;
  
  const questions = page.querySelectorAll('.qa-q-text');
  questions.forEach(q => {
    if (q.textContent === lastQ) {
      q.parentElement.parentElement.classList.add('open');
      setTimeout(() => q.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  });
}

async function stopTracking() {
  if (!currentTrackedPage) return;
  
  var elapsed = getCurrentElapsed();
  if (elapsed < 5) {
    currentTrackedPage = null;
    trackingStartTime = null;
    isPaused = false;
    pausedElapsed = 0;
    return;
  }
  
  // Persist locally for instant resume
  const total = baseSeconds + elapsed;
  localStorage.setItem('timer_' + currentTrackedPage, total);

  // Use a consistent local date string for "Today"
  const now = new Date();
  const localDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  const session = {
    topic: currentTrackedPage,
    topicName: topicConfig[currentTrackedPage] ? topicConfig[currentTrackedPage].name : currentTrackedPage,
    duration: elapsed,
    startTime: new Date(trackingStartTime).toISOString(),
    endTime: now.toISOString(),
    date: localDate // YYYY-MM-DD in local time
  };
  
  await saveSession(session);
  
  // OPTIMISTIC UI UPDATE: Inject directly into global cache to prevent tracker display lag
  if (typeof globalStudyData !== 'undefined' && globalStudyData) {
    globalStudyData.sessions.push(session);
    if (!globalStudyData.topics[session.topic]) {
      globalStudyData.topics[session.topic] = { totalSeconds: 0, sessions: 0, lastStudied: null };
    }
    globalStudyData.topics[session.topic].totalSeconds += session.duration;
    globalStudyData.topics[session.topic].sessions += 1;
    globalStudyData.topics[session.topic].lastStudied = session.date;
  }
  
  // Refresh the history timeline in the background
  setTimeout(() => { if (typeof renderHistory === 'function') renderHistory(); }, 500);
  
  currentTrackedPage = null;
  trackingStartTime = null;
  isPaused = false;
  pausedElapsed = 0;
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  var timerEl = document.getElementById('floatingTimer');
  if (activeEl) activeEl.textContent = '-';
  if (lightEl) lightEl.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
  if (floatingTimerInterval) {
    clearInterval(floatingTimerInterval);
    floatingTimerInterval = null;
  }
}

function getCurrentElapsed() {
  if (!currentTrackedPage) return 0;
  if (isPaused) return pausedElapsed;
  return pausedElapsed + Math.floor((Date.now() - trackingStartTime) / 1000);
}

function togglePause() {
  if (!currentTrackedPage) return;
  
  var btn = document.getElementById('ftPlayPause');
  var dot = document.getElementById('ftDot');
  var iconPause = document.getElementById('ftIconPause');
  var iconPlay = document.getElementById('ftIconPlay');
  
  if (isPaused) {
    // Resume
    isPaused = false;
    trackingStartTime = Date.now();
    if (btn) { btn.className = 'ft-btn playing'; btn.title = 'Pause study timer'; }
    if (iconPause) iconPause.style.display = 'block';
    if (iconPlay) iconPlay.style.display = 'none';
    if (dot) dot.className = 'ft-dot';
    startFloatingTimerInterval();
  } else {
    // Pause
    pausedElapsed += Math.floor((Date.now() - trackingStartTime) / 1000);
    isPaused = true;
    if (btn) { btn.className = 'ft-btn paused'; btn.title = 'Resume study timer'; }
    if (iconPause) iconPause.style.display = 'none';
    if (iconPlay) iconPlay.style.display = 'block';
    if (dot) dot.className = 'ft-dot paused';
    if (floatingTimerInterval) { clearInterval(floatingTimerInterval); floatingTimerInterval = null; }
  }
}

// =============================================
// FLOATING TIMER DISPLAY (top-right corner)
// =============================================
function updateFloatingTimer() {
  var ftTopic = document.getElementById('ftTopic');
  var ftTime = document.getElementById('ftTime');
  var ftDot = document.getElementById('ftDot');
  var ftBtn = document.getElementById('ftPlayPause');
  
  if (!currentTrackedPage) {
    if (ftTopic) ftTopic.textContent = 'No topic';
    if (ftTime) ftTime.textContent = '00:00';
    if (ftDot) ftDot.style.display = 'none';
    if (ftBtn) ftBtn.style.display = 'none';
    return;
  }
  
  if (ftDot) ftDot.style.display = 'inline-block';
  if (ftBtn) ftBtn.style.display = 'flex';
  
  var cfg = topicConfig[currentTrackedPage];
  if (ftTopic) ftTopic.textContent = cfg ? cfg.name : currentTrackedPage;
  
  var elapsed = getCurrentElapsed();
  var totalSeconds = baseSeconds + elapsed;
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  if (h > 0) {
    if (ftTime) ftTime.textContent = h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  } else {
    if (ftTime) ftTime.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
}

function startFloatingTimerInterval() {
  if (floatingTimerInterval) clearInterval(floatingTimerInterval);
  floatingTimerInterval = setInterval(function() {
    updateFloatingTimer();
    
    // SMOOTH LIVE UPDATES: Update UI every second without hitting server
    const isTrackerVisible = document.getElementById('study_tracker').style.display !== 'none';
    if (isTrackerVisible) updateTrackerUI(true); // 'true' means use cache
  }, 1000);
}

window.updateCourseTargets = function() {
  try {
    const data = globalStudyData;
    if (!data || !data.topics) return;
    
    let totalRecommendedMin = 0;
    for (let id in topicConfig) {
      totalRecommendedMin += topicConfig[id].recommended;
    }
    
    let totalSpentSec = 0;
    for (let id in data.topics) {
      totalSpentSec += data.topics[id].totalSeconds;
    }
    
    // Add active session if any
    if (currentTrackedPage) totalSpentSec += getCurrentElapsed();
    
    const totalReqSec = totalRecommendedMin * 60;
    const remainingSec = Math.max(0, totalReqSec - totalSpentSec);
    const deadlineDays = parseInt(document.getElementById('studyDeadlineDays').value) || 30;
    
    const requiredDailySec = remainingSec / deadlineDays;
    const progressPct = Math.min(100, Math.round((totalSpentSec / totalReqSec) * 100));
    
    const progressEl = document.getElementById('courseTotalProgress');
    const dailyEl = document.getElementById('courseRequiredDaily');
    const remainEl = document.getElementById('courseRemainingTime');
    
    if (progressEl) progressEl.textContent = progressPct + '%';
    if (dailyEl) dailyEl.textContent = (requiredDailySec / 3600).toFixed(1) + ' hrs';
    if (remainEl) remainEl.textContent = formatTime(remainingSec);
    
  } catch (e) { console.error('Goal update error', e); }
}

// Hook into the main refresh loop
const oldUpdateTrackerUI = updateTrackerUI;
updateTrackerUI = async function() {
  await oldUpdateTrackerUI();
  updateCourseTargets();
};

// =============================================
// FORMAT HELPERS
// =============================================
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '00s';
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const VERSION = '2026-04-22-T1830 (v1410)';

function formatTimeFull(totalSeconds) {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = Math.floor(totalSeconds % 60);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function getTopicStatus(topicId, data) {
  var topicData = data.topics[topicId];
  var config = topicConfig[topicId];
  if (!topicData || topicData.totalSeconds === 0) return { label: 'NOT STARTED', cls: 'status-needs-work' };
  var pct = (topicData.totalSeconds / 60) / config.recommended * 100;
  if (pct < 30) return { label: 'NEEDS WORK', cls: 'status-needs-work' };
  if (pct < 70) return { label: 'IN PROGRESS', cls: 'status-in-progress' };
  if (pct < 100) return { label: 'GOOD', cls: 'status-good' };
  return { label: 'EXCELLENT', cls: 'status-excellent' };
}

// =============================================
// SUGGESTIONS ENGINE
// =============================================
function generateSuggestions(data) {
  var suggestions = [];
  var allTopics = Object.keys(topicConfig);
  var untouched = [], needsWork = [], inProgress = [];
  
  allTopics.forEach(function(id) {
    var topicData = data.topics[id];
    var cfg = topicConfig[id];
    var spent = topicData ? topicData.totalSeconds / 60 : 0;
    var pct = spent / cfg.recommended * 100;
    if (spent === 0) untouched.push({ id:id, name:cfg.name, group:cfg.group, recommended:cfg.recommended });
    else if (pct < 30) needsWork.push({ id:id, name:cfg.name, group:cfg.group, spent:spent, recommended:cfg.recommended, pct:pct });
    else if (pct < 70) inProgress.push({ id:id, name:cfg.name, group:cfg.group, spent:spent, recommended:cfg.recommended, pct:pct });
  });
  
  var fdeTopic = untouched.filter(function(t){ return t.group === 'FDE Prep'; });
  if (fdeTopic.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;color:var(--red);"><circle cx="12" cy="12" r="10"></circle></svg>', text:'<b>Start FDE topics immediately!</b> <b>'+fdeTopic.length+' FDE topics</b> not started: '+fdeTopic.slice(0,3).map(function(t){return t.name}).join(', ')+(fdeTopic.length>3?'...':'')+'. Critical for your interview.', priority:'HIGH', cls:'priority-high' });
  }
  var nonFde = untouched.filter(function(t){ return t.group !== 'FDE Prep'; });
  if (nonFde.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;color:var(--amber);"><circle cx="12" cy="12" r="10"></circle></svg>', text:'<b>'+nonFde.length+' topics not started:</b> '+nonFde.slice(0,4).map(function(t){return t.name}).join(', ')+(nonFde.length>4?'...':'')+'.', priority:'MEDIUM', cls:'priority-medium' });
  }
  if (needsWork.length > 0) {
    var low = needsWork.sort(function(a,b){return a.pct-b.pct}).slice(0,3);
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>', text:'<b>Revisit these:</b> '+low.map(function(t){return t.name+' ('+Math.round(t.spent)+'/'+t.recommended+'m)'}).join(', '), priority:'MEDIUM', cls:'priority-medium' });
  }
  if (inProgress.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;color:var(--green);"><polyline points="20 6 9 17 4 12"></polyline></svg>', text:'<b>Almost there!</b> '+inProgress.map(function(t){return t.name+' ('+Math.round(t.pct)+'%)'}).join(', ')+'. Few more sessions needed.', priority:'LOW', cls:'priority-low' });
  }
  var ts = 0;
  Object.keys(data.topics).forEach(function(k){ 
    const td = data.topics[k];
    if (td && typeof td.totalSeconds !== 'undefined') ts += td.totalSeconds;
  });
  var th = ts / 3600;
  if (th < 5) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>', text:'<b>'+Math.round(th*10)/10+' hours total.</b> Aim for 30+ hours.', priority:'HIGH', cls:'priority-high' });
  else if (th < 20) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M18 20V10M12 20V4M6 20v-6"></path></svg>', text:'<b>Great!</b> '+Math.round(th*10)/10+' hours. Keep going!', priority:'LOW', cls:'priority-low' });
  else suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--amber);"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.34M15 22v-4H9v4M18 5V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v1c0 3.87 3.13 7 7 7s7-3.13 7-7z"></path></svg>', text:'<b>Outstanding! '+Math.round(th*10)/10+'h logged.</b> Focus on weakest areas now.', priority:'LOW', cls:'priority-low' });
  if (!suggestions.length) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:var(--blue);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>', text:'<b>Start studying!</b> Open any topic to begin.', priority:'MEDIUM', cls:'priority-medium' });
  return suggestions;
}

async function fetchDailySummary() {
  const card = document.getElementById('dailyInsightCard');
  const content = document.getElementById('summaryContent');
  const dateEl = document.getElementById('summaryDate');
  if (!card || !content) return;

  try {
    const response = await apiFetch('/api/summary/daily');
    if (!response.ok) throw new Error('Unauthorized or missing');
    const summary = await response.json();
    
    if (summary) {
      card.style.display = 'block';
      if (dateEl) dateEl.textContent = summary.date || new Date().toISOString().split('T')[0];
      
      const study = summary.study || {};
      const jobs = summary.jobs || {};
      const totalSec = (study && typeof study.totalSeconds !== 'undefined') ? study.totalSeconds : 0;
      const studyHrs = (totalSec / 3600).toFixed(1);
      const topTopic = (study && study.topTopic) ? study.topTopic : 'None';
      const jobsCount = jobs.newCount || 0;
      const topMatches = jobs.topMatches || [];
      const topJob = topMatches.length > 0 && topMatches[0].title ? topMatches[0].title : 'Searching...';
      
      content.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--blue);"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
          <span>You've studied for <b>${studyHrs} hours</b> today, focusing primarily on <b>${topTopic}</b>.</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--muted);"><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07M4.93 4.93a10 10 0 0 0 0 14.14"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span>The Job Radar discovered <b>${jobsCount} new opportunities</b> today.</span>
        </div>
        ${topMatches.length > 0 ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; color:var(--text); font-size:0.75rem;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#f59e0b;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Top Match: <b>${topJob}</b></div>` : ''}
        <div style="color:var(--green); font-size:0.7rem; margin-top:8px; display:flex; align-items:center; gap:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:10px;height:10px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Daily state synced to cloud database
        </div>
      `;
    }
  } catch (e) { console.error('Failed to fetch summary', e); }
}

let currentHistoryTab = 'timeline';

function switchHistoryTab(mode) {
  currentHistoryTab = mode;
  document.querySelectorAll('.history-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(mode)) btn.classList.add('active');
  });
  renderHistory();
}

async function syncDashboard() {
  try {
    console.log('ðŸ”„ Initiating resilient dashboard sync...');
    // Execute individually so one crash doesn't block others
    await updateTrackerUI().catch(e => console.error('UI Tracker fail', e));
    await renderTimetable().catch(e => console.error('Timetable fail', e)); // FIXED: Added to sync
    await fetchDailySummary().catch(e => console.error('Daily Summary fail', e));
    await fetchJobs().catch(e => console.error('Jobs fail', e));
    await renderHistory().catch(e => console.error('History fail', e));
    await loadUserProfile().catch(e => console.error('Profile fail', e));
  } catch(e) { console.error('Dashboard sync failed', e); }
}

async function syncHistoryWithFeedback() {
  const btn = document.getElementById('syncHistoryBtn');
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  
  if (!btn) { renderHistory(); return; }

  // Start Feedback
  icon.classList.add('spin');
  text.textContent = 'Syncing...';
  btn.style.opacity = '0.8';
  btn.style.pointerEvents = 'none';

  try {
    console.log('[Sync] Triggering history rebuild...');
    await renderHistory();
    console.log('[Sync] Success.');
    
    // Success State
    text.textContent = 'Data Synced!';
    icon.classList.remove('spin');
    btn.style.background = 'var(--green)';
    btn.style.boxShadow = '0 4px 15px rgba(16,185,129,0.3)';
    
    setTimeout(() => {
      text.textContent = 'Sync Dashboard';
      btn.style.background = 'var(--blue)';
      btn.style.boxShadow = '0 4px 15px rgba(79,142,247,0.3)';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  } catch (e) {
    console.error('[Sync] Failed:', e);
    icon.classList.remove('spin');
    text.textContent = 'Sync Failed';
    btn.style.background = 'var(--red)';
    setTimeout(() => {
      text.textContent = 'Sync Dashboard';
      btn.style.background = 'var(--blue)';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }
}

async function renderHistory() {
  const container = document.getElementById('historyTimeline');
  if (!container) return;

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  const yestStr = yest.getFullYear() + '-' + String(yest.getMonth()+1).padStart(2,'0') + '-' + String(yest.getDate()).padStart(2,'0');

  // STEP 1: INSTANT LOAD (If we have cache, show it immediately to avoid glitch)
  if (Object.keys(cachedHistories).length > 0) {
    renderHistoryUI(container, cachedHistories, todayStr, yestStr);
  }

  try {
    const viewMode = currentHistoryTab;
    // STEP 2: SILENT BACKGROUND SYNC
    const response = await apiFetch('/api/summary/all?cache_bust=' + Date.now());
    if (!response.ok) throw new Error('Unauthorized');
    const histories = await response.json();
    
    // Virtual Today entry for real-time tracking
    if (currentTrackedPage) {
      const liveSecs = getCurrentElapsed();
      const tid = currentTrackedPage;
      const tName = topicConfig[tid] ? topicConfig[tid].name : tid;
      
      if (!histories[todayStr]) {
        histories[todayStr] = { 
          study: { totalSeconds: 0, sessionsCount: 1, topicList: [] }, 
          jobs: { newCount: 0, topMatches: [] } 
        };
      }

      const h = histories[todayStr];
      h.study.totalSeconds += liveSecs;
      
      if (!h.study.topicList) h.study.topicList = [];
      let entry = h.study.topicList.find(x => x.id === tid);
      if (!entry) {
        entry = { id: tid, name: tName, totalSeconds: 0 };
        h.study.topicList.push(entry);
      }
      entry.totalSeconds += liveSecs;
    }
    
    // FINAL SAFETY: Ensure topicList exists for all history entries
    Object.keys(histories).forEach(date => {
      const h = histories[date];
      if (h.study && !h.study.topicList) {
        const breakdown = h.study.breakdown || h.study.topicBreakdown || {};
        h.study.topicList = Object.keys(breakdown).map(k => {
          const item = breakdown[k] || {};
          return { id: k, name: item.name || k, totalSeconds: item.totalSeconds || 0 };
        });
      }
    });

    // STEP 3: UPDATE CACHE & RE-RENDER SILENTLY
    cachedHistories = histories;
    renderHistoryUI(container, histories, todayStr, yestStr);

  } catch (e) { 
    console.error('History Render Error:', e); 
    if (Object.keys(cachedHistories).length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--muted);">Cloud history currently unavailable. Check connection.</div>';
    }
  }
}

function renderHistoryUI(container, histories, todayStr, yestStr) {
  const viewMode = currentHistoryTab;
  const filter = document.getElementById('historyPeriodFilter') ? document.getElementById('historyPeriodFilter').value : 'current_month';
  let dates = Object.keys(histories).sort().reverse();

  if (filter === 'today') dates = dates.filter(d => d === todayStr);
  else if (filter === 'yesterday') dates = dates.filter(d => d === yestStr);
  else if (filter === 'current_month') {
    const now = new Date();
    const prefix = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    dates = dates.filter(d => d.startsWith(prefix));
  }

  let totalSecs = 0, dayCount = 0;
  dates.forEach(date => { 
    if (histories[date] && histories[date].study && histories[date].study.totalSeconds > 0) {
      totalSecs += histories[date].study.totalSeconds;
      dayCount++;
    }
  });

  if (viewMode === 'timeline') {
    renderTimelineView(container, dates, histories, todayStr, yestStr);
  } else if (viewMode === 'table') {
    renderTableView(container, dates, histories);
  } else if (viewMode === 'analytics') {
    renderAnalyticsView(container, dates, histories);
  }

  // Update Stats
  const totalEl = document.getElementById('historyTotalTime');
  const countEl = document.getElementById('historyDayCount');
  const avgEl = document.getElementById('historyAvgTime');
  if (totalEl) totalEl.textContent = formatTimeFull(totalSecs);
  if (countEl) countEl.textContent = dayCount;
  if (avgEl) avgEl.textContent = formatTimeFull(dayCount > 0 ? totalSecs/dayCount : 0);
}

function renderTimelineView(container, dates, histories, todayStr, yestStr) {
  let html = '<div style="display:flex; flex-direction:column; gap:15px; margin-top:1rem;">';
  dates.forEach((date, idx) => {
    const h = histories[date];
    const isToday = (date === todayStr);
    const isYesterday = (date === yestStr);
    const jobsCount = h.jobs ? h.jobs.newCount : 0;
    const breakdown = h.study.breakdown || {};
    const topicIds = h.study.topics || [];
    const previewIds = topicIds.slice(0, 3);
    
    const colors = ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const accent = isToday ? '#10b981' : colors[idx % colors.length];

    html += `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; height:100%; width:4px; background:${accent};"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${isToday ? 'Today' : (isYesterday ? 'Yesterday' : date)}</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime((h.study && h.study.totalSeconds) ? h.study.totalSeconds : 0)}</div>
          </div>
          <button onclick="showHistoryModal('${date}')" style="background:${accent}22; color:${accent}; border:1px solid ${accent}44; padding:8px 15px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:0.2s;">ðŸ” View Deep Info</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${previewIds.length > 0 ? previewIds.map(tid => {
            const name = (breakdown[tid] ? breakdown[tid].name : (topicConfig[tid] ? topicConfig[tid].name : tid));
            return `<span style="font-size:0.65rem; background:rgba(255,255,255,0.05); color:var(--muted); padding:3px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              ${name}
            </span>`;
          }).join('') : '<span style="font-size:0.65rem; color:var(--muted); font-style:italic;">No topics logged</span>'}
          ${topicIds.length > 3 ? `<span style="font-size:0.65rem; color:var(--blue); padding:3px 0;">+${topicIds.length - 3} more</span>` : ''}
        </div>
        
        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
           <div style="display:flex; gap:10px; align-items:center;">
             <span style="font-size:0.7rem; background:rgba(79,142,247,0.1); color:var(--blue); padding:3px 10px; border-radius:20px;">ðŸ“¡ Radar Active</span>
             <span style="font-size:0.75rem; color:var(--text);">${jobsCount} Jobs Found</span>
           </div>
           <div style="font-size:0.7rem; color:var(--muted); font-family:'IBM Plex Mono';">#${date.replace(/-/g,'')}</div>
        </div>
      </div>`;
  });
  if (!dates.length) html = '<div style="text-align:center; padding:3rem; color:var(--muted);">No session history found.</div>';
  html += '</div>';
  container.innerHTML = html;
}

function renderTableView(container, dates, histories) {
  let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px; margin-top:1rem;">';
  dates.forEach((date, idx) => {
    const h = histories[date];
    const accent = '#4f8ef7';

    html += `
      <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:1.2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--text);">${date}</span>
          <span style="font-size:0.85rem; color:var(--blue); font-family:'IBM Plex Mono'; font-weight:700;">${formatTime(h.study.totalSeconds)}</span>
        </div>
        <button onclick="showHistoryModal('${date}')" style="width:100%; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); color:var(--text); padding:8px; border-radius:8px; font-size:0.75rem; font-weight:600; cursor:pointer;">Analyze Topics</button>
        <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; font-size:0.65rem; color:var(--green); display:flex; justify-content:space-between;">
           <span>Radar Matches</span>
           <span>+${h.jobs ? h.jobs.newCount : 0} Hits</span>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderAnalyticsView(container, dates, histories) {
  const topicStats = {};
  const topicDetails = {};
  
  dates.forEach(date => {
    const h = histories[date];
    const breakdown = h.study.topicBreakdown || {};
    
    if (Object.keys(breakdown).length > 0) {
      Object.keys(breakdown).forEach(t => {
        if (t === 'None') return;
        topicStats[t] = (topicStats[t] || 0) + (breakdown[t].totalSeconds || 0);
        if (!topicDetails[t]) topicDetails[t] = { sessions: 0, lastDate: date };
        topicDetails[t].sessions += (h.study.sessionsCount || 1);
        if (date > topicDetails[t].lastDate) topicDetails[t].lastDate = date;
      });
    } else if (h.study.totalSeconds > 0) {
      // Fallback for old data: assume topTopic or distribute among allTopics
      const topT = h.study.topTopic || (h.study.allTopics && h.study.allTopics[0]) || 'General';
      topicStats[topT] = (topicStats[topT] || 0) + h.study.totalSeconds;
      if (!topicDetails[topT]) topicDetails[topT] = { sessions: 0, lastDate: date };
      topicDetails[topT].sessions += (h.study.sessionsCount || 1);
    }
  });

  const sortedTopics = Object.keys(topicStats).sort((a,b) => topicStats[b] - topicStats[a]);
  let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:15px; margin-top:1rem;">';
  
  sortedTopics.forEach((t, idx) => {
    let cfg = null;
    for (let id in topicConfig) { if (topicConfig[id].name === t || t.startsWith(topicConfig[id].name)) { cfg = topicConfig[id]; break; } }
    const spent = topicStats[t];
    const target = cfg ? (cfg.recommended * 60) : 3600;
    const pct = Math.min((spent / target) * 100, 100);
    const details = topicDetails[t];
    
    const colors = ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const accent = colors[idx % colors.length];

    html += `
      <div style="background:rgba(255,255,255,0.02); padding:1.2rem; border-radius:12px; border:1px solid rgba(255,255,255,0.05); position:relative; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
        <div style="position:absolute; top:0; left:0; height:100%; width:4px; background:${accent};"></div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
          <div style="font-size:1rem; font-weight:700; color:var(--text); line-height:1.2;">${t}</div>
          <div style="font-size:0.7rem; font-weight:700; color:${accent}; background:rgba(255,255,255,0.05); padding:3px 10px; border-radius:10px;">${Math.round(pct)}% Done</div>
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:1.5rem;">
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:8px;">
            <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Total Time</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime(spent)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:8px;">
            <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Sessions</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${details.sessions}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--muted); margin-bottom:10px;">
           <span>Target: ${formatTime(target)}</span>
           <span>Last: ${details.lastDate}</span>
        </div>

        <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${accent}; box-shadow:0 0 10px ${accent}44;"></div>
        </div>
      </div>`;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// =============================================
// TRACKER UI RENDERER
// =============================================
async function updateTrackerUI(useCache = false) {
  const data = useCache && globalStudyData ? globalStudyData : await getStudyData();
  var allTopics = Object.keys(topicConfig);
  var liveSeconds = getCurrentElapsed();
  
  var totalSeconds = 0, totalSessionCount = 0, topicsStudied = 0, todaySeconds = 0;
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  
  allTopics.forEach(function(id) {
    var td = data.topics[id];
    if (td) {
      totalSeconds += td.totalSeconds;
      totalSessionCount += td.sessions;
      if (td.totalSeconds > 0) topicsStudied++;
    }
  });
  if (currentTrackedPage) totalSeconds += liveSeconds;
  
  data.sessions.forEach(function(s) {
    if (s.date === today) todaySeconds += s.duration;
  });
  if (currentTrackedPage) todaySeconds += liveSeconds;

  // Real-time Summary Card Update
  const card = document.getElementById('dailyInsightCard');
  const content = document.getElementById('summaryContent');
  if (card && content) {
    card.style.display = 'block';
    const studyHrs = (todaySeconds / 3600).toFixed(2);
    const activeTopic = currentTrackedPage ? topicConfig[currentTrackedPage].name : 'None';
    
    content.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--blue);"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
        <span><b>Real-time Update:</b> You've studied for <b>${studyHrs} hours</b> today.</span>
      </div>
      ${currentTrackedPage ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--green);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Currently focusing on: <b style="color:var(--green);">${activeTopic}</b></div>` : ''}
      <div style="color:var(--blue); font-size:0.7rem; margin-top:8px; display:flex; align-items:center; gap:4px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07M4.93 4.93a10 10 0 0 0 0 14.14"></path><circle cx="12" cy="12" r="3"></circle></svg>
        Live cloud-syncing active...
      </div>
    `;
  }
  
  var el;
  el = document.getElementById('totalStudyTime'); if(el) el.textContent = formatTimeFull(totalSeconds);
  el = document.getElementById('totalSessions'); if(el) el.textContent = totalSessionCount + (currentTrackedPage ? '+1' : '');
  el = document.getElementById('totalTopics'); if(el) el.textContent = topicsStudied + ' / ' + allTopics.length;
  el = document.getElementById('todayTime'); if(el) el.textContent = formatTimeFull(todaySeconds);
  
  var chartEl = document.getElementById('timeChart');
  if (chartEl) {
    var maxSeconds = 1;
    var colors = {'Technical':'linear-gradient(90deg,#4f8ef7,#22d3ee)','Communication':'linear-gradient(90deg,#f472b6,#a78bfa)','Domain':'linear-gradient(90deg,#f4c542,#3dd68c)','FDE Prep':'linear-gradient(90deg,#6366f1,#a78bfa)','General':'linear-gradient(90deg,#3dd68c,#22d3ee)','Scenarios':'linear-gradient(90deg,#fb923c,#f472b6)','Reference':'linear-gradient(90deg,#a78bfa,#818cf8)','Strategy':'linear-gradient(90deg,#f4c542,#fb923c)','Company':'linear-gradient(90deg,#34d399,#3dd68c)'};
    allTopics.forEach(function(id) {
      var s = (data.topics[id]?data.topics[id].totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      if (s > maxSeconds) maxSeconds = s;
    });
    var chartHtml = '';
    allTopics.forEach(function(id) {
      var cfg = topicConfig[id];
      var s = (data.topics[id]?data.topics[id].totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      var pct = Math.min((s/maxSeconds)*100, 100);
      if (s===0 && maxSeconds>1) pct = 0;
      var color = colors[cfg.group] || colors['General'];
      var active = currentTrackedPage===id ? ' <span style="color:var(--green);font-size:0.6rem;">â— LIVE</span>' : '';
      chartHtml += '<div class="chart-bar-container"><div class="chart-bar-label">'+cfg.name+active+'</div><div class="chart-bar-wrap"><div class="chart-bar-value" style="width:'+pct+'%;background:'+color+';"></div></div><div class="chart-bar-time">'+formatTime(s)+'</div></div>';
    });
    chartEl.innerHTML = chartHtml;
  }
  
  var sugEl = document.getElementById('suggestions');
  if (sugEl) {
    var sug = generateSuggestions(data);
    sugEl.innerHTML = sug.map(function(s){ return '<div class="suggestion-card"><span class="suggestion-icon">'+s.icon+'</span><span class="suggestion-text">'+s.text+'</span> <span class="suggestion-priority '+s.cls+'">'+s.priority+'</span></div>'; }).join('');
  }
  
  var gridEl = document.getElementById('trackerGrid');
  if (gridEl) {
    var gridHtml = '';
    allTopics.forEach(function(id) {
      var cfg = topicConfig[id], td = data.topics[id];
      var s = (td?td.totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      var pct = Math.min((s/60)/cfg.recommended*100, 100);
      var status = getTopicStatus(id, data);
      var last = td&&td.lastStudied ? new Date(td.lastStudied).toLocaleDateString() : 'Never';
      var isActive = currentTrackedPage===id;
      gridHtml += '<div class="tracker-card" style="--progress:'+pct+'%;'+(isActive?'border-color:var(--green);':'')+'">';
      gridHtml += '<div class="tracker-status '+status.cls+'">'+(isActive?(isPaused?'â¸ PAUSED':'â— LIVE'):status.label)+'</div>';
      gridHtml += '<div class="tracker-topic">'+cfg.name+'</div>';
      gridHtml += '<div class="tracker-time">'+formatTime(s)+' <span style="font-size:0.7rem;color:var(--muted);font-weight:400;">/ '+cfg.recommended+'m</span></div>';
      gridHtml += '<div class="tracker-bar"><div class="tracker-bar-fill" style="width:'+pct+'%;"></div></div>';
      gridHtml += '<div class="tracker-sessions">'+(td?td.sessions:0)+' sessions Â· Last: '+last+'</div></div>';
    });
    gridEl.innerHTML = gridHtml;
  }
  
  var histEl = document.getElementById('sessionHistory');
  if (histEl) {
    var sess = (data.sessions || []).slice(-10).reverse();
    if (!sess.length) {
      histEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">No sessions yet. Open any topic to start.</p>';
    } else {
      var hh = '<table class="comparison-table" style="margin:0;"><tr><th>Topic</th><th>Duration</th><th>Date</th></tr>';
      sess.forEach(function(s) {
        var d = new Date(s.date);
        hh += '<tr><td>'+s.topicName+'</td><td>'+formatTime(s.duration)+'</td><td>'+d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</td></tr>';
      });
      histEl.innerHTML = hh + '</table>';
    }
  }
}

async function resetTracker() {
  if (confirm('Reset ALL study data? This will wipe your local and cloud database. This cannot be undone.')) {
    try {
      await fetch('/api/study/reset', { method: 'POST' });
      
      // Clear localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('timer_') || k.startsWith('last_q_') || k === TRACKER_KEY) {
          localStorage.removeItem(k);
        }
      });
      
      currentTrackedPage = null; 
      trackingStartTime = null; 
      isPaused = false; 
      pausedElapsed = 0;
      baseSeconds = 0;
      
      await updateTrackerUI(); 
      updateFloatingTimer();
      alert('Cloud and local data has been successfully reset. Fresh start enabled!');
    } catch (e) {
      alert('Failed to reset cloud data. Please check your server connection.');
    }
  }
}

// =============================================
// JOB RADAR INTEGRATION
// =============================================
function updateJobRadarSummary() {
  try {
    const dbJobs = window.allJobRecords || [];
    const submittedCount = pipelineJobs.filter(job => job.status !== 'todo').length;
    const elDedupe = document.getElementById('dedupeCount');
    const elTracked = document.getElementById('trackedCount');
    const elApplied = document.getElementById('appliedCount');

    if (elDedupe) elDedupe.textContent = String(dbJobs.length);
    if (elTracked) elTracked.textContent = String(pipelineJobs.length);
    if (elApplied) elApplied.textContent = String(submittedCount);
  } catch (e) {
    console.error('Failed to update job summary', e);
  }
}

window.allJobRecords = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeInlineArg(value) {
  return encodeURIComponent(String(value ?? ''));
}

function safeUrl(value) {
  if (!value) return '#';
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return parsed.href;
  } catch (e) {
    return '#';
  }
}

function normalizeProbability(probability, score) {
  const value = String(probability || '').toLowerCase();
  if (value === 'high' || value === 'medium' || value === 'stretch') return value;
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'stretch';
}

function mapRecordStatusToBoardStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'applied') return 'applied';
  if (normalized === 'ignored' || normalized === 'rejected') return 'rejected';
  if (normalized === 'interview' || normalized === 'offer' || normalized === 'todo') return normalized;
  return 'todo';
}

function buildPipelineJobFromRecord(record, existingJob) {
  const existing = existingJob || {};
  const score = Number(record.match_score || existing.score || 75);
  const mappedStatus = existing.status || mapRecordStatusToBoardStatus(record.status);
  const jobHash = record.job_hash || existing.job_hash || btoa([
    record.company || existing.company || '',
    record.role || record.title || existing.role || '',
    record.location || existing.loc || ''
  ].join('|'));

  return {
    ...existing,
    id: existing.id || record.id || ('job_' + Math.random().toString(36).slice(2, 11)),
    job_hash: jobHash,
    company: record.company || existing.company || 'Confidential',
    role: record.role || record.title || existing.role || 'Salesforce Role',
    loc: record.location || existing.loc || 'India',
    sal: record.salary || existing.sal || 'Competitive',
    experience: record.experience || existing.experience || '3-5 Yrs',
    company_type: record.company_type || existing.company_type || 'MNC',
    why_apply: record.why_apply || existing.why_apply || 'Matches your current Salesforce profile and target path.',
    skills: Array.isArray(record.matched_skills) && record.matched_skills.length
      ? record.matched_skills
      : (existing.skills || ['Apex', 'LWC']),
    matched_skills: Array.isArray(record.matched_skills) ? record.matched_skills : (existing.matched_skills || []),
    missing_skills: Array.isArray(record.missing_skills) ? record.missing_skills : (existing.missing_skills || []),
    resume_actions: Array.isArray(record.resume_actions) ? record.resume_actions : (existing.resume_actions || []),
    score,
    prob: normalizeProbability(record.probability, score),
    status: mappedStatus,
    url: safeUrl(record.apply_link || record.url || existing.url || '#'),
    created_at: record.created_at || existing.created_at || new Date().toISOString(),
    match_level: record.match_level || existing.match_level || '',
    dateApplied: existing.dateApplied || (mappedStatus === 'applied' ? new Date().toISOString() : ''),
    outreach: existing.outreach || null,
    icon: existing.icon || record.icon || 'SF'
  };
}

function getBoardSearchTerm() {
  return currentBoardSearch.trim().toLowerCase();
}

function jobMatchesBoardSearch(job, term) {
  if (!term) return true;
  const haystack = [
    job.company,
    job.role,
    job.loc,
    job.company_type,
    job.why_apply,
    ...(job.skills || []),
    ...(job.missing_skills || [])
  ].join(' ').toLowerCase();
  return haystack.includes(term);
}

function getProbabilityMeta(probability) {
  if (probability === 'high') return { label: 'High fit', cls: 'high' };
  if (probability === 'stretch') return { label: 'Stretch', cls: 'stretch' };
  return { label: 'Medium fit', cls: 'medium' };
}

function sortBoardJobs(a, b) {
  const followA = getFollowUpStatus(a);
  const followB = getFollowUpStatus(b);
  const followWeight = { ghost: 3, urgent: 2, warn: 1 };
  const followDelta = (followWeight[followB?.class] || 0) - (followWeight[followA?.class] || 0);
  if (followDelta !== 0) return followDelta;

  const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDelta !== 0) return scoreDelta;

  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

async function fetchJobsList() {
  console.log('ðŸ“¡ [RADAR] Fetching jobs from database...');
  try {
    const response = await apiFetch('/api/jobs');
    if (!response.ok) throw new Error('Unauthorized or Server Down');
    const data = await response.json();
    console.log('ðŸ“¦ [RADAR] Raw Server Response:', data);
    window.allJobRecords = data.records || [];
    console.log(`âœ… [RADAR] Received ${window.allJobRecords.length} jobs. DB Status: ${data.dbStatus}`);

    let addedCount = 0;
    let updatedCount = 0;

    window.allJobRecords.forEach(rec => {
      const fallbackHash = rec.job_hash || btoa([
        rec.company || '',
        rec.role || rec.title || '',
        rec.location || ''
      ].join('|'));

      const existingIndex = pipelineJobs.findIndex(job =>
        job.id === rec.id ||
        job.job_hash === fallbackHash ||
        (job.company === rec.company && job.role === (rec.role || rec.title))
      );

      if (existingIndex >= 0) {
        pipelineJobs[existingIndex] = buildPipelineJobFromRecord(rec, pipelineJobs[existingIndex]);
        updatedCount += 1;
      } else {
        pipelineJobs.unshift(buildPipelineJobFromRecord(rec));
        addedCount += 1;
      }
    });

    savePipeline();
    renderBoard();
    updateJobRadarSummary();
    fetchJobAnalytics();
    renderLog();
    switchRadarSubTab(currentRadarSubTab);

    const dbBadge = document.getElementById('dbStatusBadge');
    if (dbBadge) {
      dbBadge.textContent = 'Cloud Active';
      dbBadge.style.background = 'rgba(16,185,129,0.1)';
      dbBadge.style.color = 'var(--green)';
    }

    const archiveBadge = document.getElementById('archiveStatusBadge');
    if (archiveBadge && data.storageCapacity) {
      archiveBadge.style.display = 'inline-block';
      archiveBadge.textContent = `Capacity: ${data.storageCapacity}`;
      archiveBadge.title = 'Automated high-capacity cloud storage is active';
      archiveBadge.style.background = 'rgba(139,92,246,0.1)';
      archiveBadge.style.color = '#c4b5fd';
    }

    if (addedCount > 0) {
      logActivity(`Synced ${addedCount} new jobs into the board and refreshed ${updatedCount} existing cards.`, 'success');
    }
  } catch (e) {
    console.error('âŒ [RADAR] Error fetching jobs:', e);
    const dbBadge = document.getElementById('dbStatusBadge');
    if (dbBadge) {
      dbBadge.textContent = 'Sync Failed';
      dbBadge.style.background = 'rgba(239,68,68,0.12)';
      dbBadge.style.color = 'var(--red)';
    }
    showToast('Failed to load jobs from the database.');
  }
}

function clearAndSyncJobs() {
    console.log('ðŸ§¹ Resetting Job Radar cache only...');
    localStorage.removeItem('sfpipe2026v3');
    localStorage.removeItem('sfActivityLog');
    pipelineJobs = [];
    activityLog = [];
    currentBoardSearch = '';
    currentBoardFilter = 'all';
    radarBoardLimits = { todo: 10, applied: 10, interview: 10, offer: 10, rejected: 10 };
    showToast('Job Radar cache cleared. Rebuilding from the latest scan...');
    setTimeout(() => {
        window.location.reload();
    }, 1200);
}

async function fetchJobAnalytics() {
  try {
    const response = await apiFetch('/api/jobs/analytics');
    if (!response.ok) return;
    const data = await response.json();
    
    const matchedEl = document.getElementById('matchedSkillsTrends');
    const missingEl = document.getElementById('missingSkillsTrends');
    const companiesEl = document.getElementById('topCompaniesTrends');
    
    if (matchedEl && data.matched_skills) {
      matchedEl.innerHTML = data.matched_skills.length ? data.matched_skills.map(s => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;"><span>${s._id}</span> <span style="font-weight:700;">${s.count}</span></div>`).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
    if (missingEl && data.missing_skills) {
      missingEl.innerHTML = data.missing_skills.length ? data.missing_skills.map(s => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;"><span>${s._id}</span> <span style="font-weight:700;">${s.count}</span></div>`).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
    if (companiesEl && data.top_companies) {
      companiesEl.innerHTML = data.top_companies.length ? data.top_companies.map(c => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;"><span>${c._id}</span> <span style="font-weight:700;">${c.count}</span></div>`).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
  } catch (e) {
    console.error('Failed to fetch analytics', e);
  }
}

async function fetchJobs() {
  return fetchJobsList();
}

function filterJobsList() {
  renderBoard();
}

function renderJobsList(jobs) {
  const container = document.getElementById('jobsListContainer');
  if (!container) return;
  
  if (!jobs || !jobs.length) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center;">No jobs tracked yet.</p>';
    return;
  }
  
  container.innerHTML = jobs.map(job => `
    <div class="job-card">
      <div class="job-info">
        <div class="job-title">${escapeHtml(job.title || job.role || 'Salesforce role')}</div>
        <div class="job-company">${escapeHtml(job.company || 'Confidential')} · ${escapeHtml(job.location || job.loc || 'India')}</div>
      </div>
      <div class="job-actions">
        <a class="btn-action" href="${safeUrl(job.apply_link || job.url)}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
    </div>
  `).join('');
}

async function triggerJobScan() {
  const btn = document.getElementById('btnScanJobs');
  const statusText = document.getElementById('scanStatusText');
  const originalHtml = btn ? (btn.dataset.originalHtml || btn.innerHTML) : '';

  if (btn) {
    btn.dataset.originalHtml = originalHtml;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = 'SCANNING JOB SOURCES...';
  }
  if (statusText) statusText.textContent = 'Running fresh job scan and profile match analysis...';

  showToast('Scan started. Fetching the latest Salesforce roles.');

  try {
    const res = await apiFetch('/api/jobs/scan', { method: 'POST' });
    const data = await res.json();
    
    if (data.success) {
      if (statusText) statusText.textContent = 'Scan started. Waiting for the background agent to finish...';
      showToast('AI agent is analyzing job matches now.');
      setTimeout(async () => {
        await fetchJobsList(); 
        showToast('Dashboard synced with the latest job scan.');
        if (statusText) statusText.textContent = 'Last sync completed successfully.';
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerHTML = btn.dataset.originalHtml || originalHtml;
        }
      }, 5000); 
    } else {
      throw new Error(data.error || 'Scan failed');
    }
  } catch (e) {
    console.error('Scan Error:', e);
    showToast('Scan failed. The local job agent may be offline.');
    if (statusText) statusText.textContent = 'Scan failed. Check local agent health and try again.';
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = btn.dataset.originalHtml || originalHtml;
    }
  }
}

async function smartApply(hash) {
  if (!confirm('This will launch a local browser to attempt automated "Easy Apply" using your active Chrome session. Continue?')) return;
  
  try {
    const res = await apiFetch('/api/jobs/apply', {
      method: 'POST',
      body: JSON.stringify({ hash })
    });
    const data = await res.json();
    if (data.success) {
      alert('Automation launched. Look at your taskbar for a new Chrome window.');
    } else {
      alert('Failed to launch automation: ' + data.error);
    }
  } catch (e) {
    alert('Error connecting to local automation agent.');
  }
}

async function generateCoverLetter(hash) {
  const job = window.allJobRecords.find(j => j.job_hash === hash);
  if (!job) return;

  const btnIcon = document.getElementById(`cl_icon_${hash}`);
  const outputEl = document.getElementById(`cl_output_${hash}`);
  
  if (btnIcon) btnIcon.textContent = '...';
  if (!outputEl) return;
  outputEl.style.display = 'block';
  outputEl.innerHTML = '<span style="color:var(--muted);">Gemma 4 is analyzing the job requirements and your matched skills to write a tailored cover letter...</span>';

  try {
    const prompt = `You are an expert career coach. Write a short, punchy, and highly professional 3-paragraph cover letter for a Salesforce Developer applying to ${job.company} for the "${job.title}" role. 
The candidate has the following skills that perfectly match the job: ${(job.matched_skills || []).join(', ')}. 
Do not include placeholders like [Your Name] or [Date], just write the core body of the letter. Focus on impact and value.`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:e4b',
        prompt: prompt,
        stream: false
      })
    });
    
    if (!res.ok) throw new Error('Ollama not responding.');
    const data = await res.json();
    
    outputEl.innerHTML = data.response;
    if (btnIcon) btnIcon.textContent = 'OK';
    
  } catch(e) {
    outputEl.innerHTML = '<span style="color:var(--red);">Failed to connect to local Gemma 4 engine. Ensure Ollama is running and OLLAMA_ORIGINS="*" is set.</span>';
    if (btnIcon) btnIcon.textContent = 'Error';
  }
}


async function updateJobStatus(hash, status) {
  const boardStatus = mapRecordStatusToBoardStatus(status);
  const target = pipelineJobs.find(job => job.job_hash === hash);
  if (!target) return;
  moveTo(target.id, boardStatus);
}

function getActionSetForJob(job) {
  if (job.status === 'todo') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Mark Applied', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'applied')` },
      { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` },
      { label: 'Coach', cls: 'secondary', onClick: `openCoach(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'applied') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Interview', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'interview')` },
      { label: 'Outreach', cls: 'secondary', onClick: `openOutreach(decodeURIComponent('${encodeInlineArg(job.id)}'))` },
      { label: 'Email', cls: 'secondary', onClick: `openEmailModal(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'interview') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Offer', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'offer')` },
      { label: 'Reject', cls: 'danger', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'rejected')` },
      { label: 'Coach', cls: 'secondary', onClick: `openCoach(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'offer') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` },
      { label: 'Reject', cls: 'danger', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'rejected')` }
    ];
  }

  return [
    { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
    { label: 'Reopen', cls: 'secondary', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'todo')` },
    { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` }
  ];
}

const SCHEDULE_DATA = [
  { 
    time: '05:00', end: '05:40', title: 'Wake up naturally â€” no alarm panic', 
    desc: 'You already wake between 5 and 6 AM naturally â€” this is a powerful advantage. Your cortisol is highest in the early morning which means peak alertness and energy. Drink one large glass of water the moment you wake. Do NOT open your phone, WhatsApp, or social media before your workout. Start the body first, screens later.', 
    tag: 'Fitness' 
  },
  { 
    time: '05:40', end: '06:10', title: 'Morning Workout â€” strength, bodyweight, or gym', 
    desc: 'Whatever your current workout routine is â€” keep doing it exactly as you are. Exercise before study has been shown to boost memory retention, focus, and mood for 2â€“4 hours afterward. This is not time away from preparation â€” the workout IS preparation. It makes every study session more effective.', 
    tag: 'Fitness' 
  },
  { 
    time: '06:10', end: '08:00', title: '10,000 Steps Walk â€” outdoor walk', 
    desc: 'Outdoor walk. Rehearse STAR stories or listen to podcasts. Subconscious processing happens here. Choose tech blogs or speaking practice.', 
    tag: 'Fitness' 
  },
  { 
    time: '08:00', end: '08:30', title: 'Communication Block 1 â€” Read aloud + Vocab', 
    desc: 'Read one tech article aloud slowly. Trains pronunciation, fluency, and confidence. Pick 3 new words and use them in a Salesforce context.', 
    tag: 'Comm' 
  },
  { 
    time: '08:30', end: '10:30', title: 'Core Technical Study Block 1 â€” Deep Focus', 
    desc: 'Post-workout, post-walk, your brain is at absolute peak performance. Focus on today topic. No phone, no music, no interruptions. Explain it aloud to yourself from memory.', 
    tag: 'Technical' 
  },
  { 
    time: '10:30', end: '12:00', title: 'Hands-on Coding â€” Trailhead / Dev Org', 
    desc: 'Build what you just studied. Write every line from scratch in your Dev Org. Do not copy-paste. Coding errors you solve now are your best teachers.', 
    tag: 'Coding' 
  },
  { 
    time: '12:00', end: '13:00', title: 'Spoken Interview Q&A Practice', 
    desc: 'Answer 3-4 questions out loud. Record yourself and watch honestly. Note filler words, speed, and structure (Point -> Explain -> Example).', 
    tag: 'Comm' 
  },
  { 
    time: '13:00', end: '14:30', title: 'Lunch + Power Nap â€” Brain Reset', 
    desc: 'Eat a proper lunch. Move completely away from the desk. No studying, no screens. Quality rest leads to a quality afternoon session.', 
    tag: 'Rest' 
  },
  { 
    time: '14:30', end: '16:00', title: 'Core Technical Study Block 2 â€” Deep Dive', 
    desc: 'Go deeper into this morning topic or related sub-topics. Depth beats breadth. Write code for every concept. Study aggregate functions, bind variables, etc.', 
    tag: 'Technical' 
  },
  { 
    time: '16:00', end: '16:30', title: 'Job Radar Application â€” Radar Dashboard', 
    desc: 'Apply to 3-5 roles via Radar Dashboard. Send 2 personalized recruiter messages. Consistency here is everything â€” zero applications = zero chances.', 
    tag: 'Radar' 
  },
  { 
    time: '16:30', end: '17:00', title: 'Chai + Micro-break â€” Disconnect', 
    desc: 'Step away from screen. Rest your eyes. Let your brain move short-term memory to long-term storage. No phone during this window.', 
    tag: 'Rest' 
  },
  { 
    time: '17:00', end: '18:00', title: 'Communication Block 2 â€” STAR Stories', 
    desc: 'Master 2 STAR stories today. Practice out loud. Each story should be 2-2.5 minutes. Lead with the result: "I reduced pull time from 25m to 30s."', 
    tag: 'Comm' 
  },
  { 
    time: '18:00', end: '19:00', title: 'Project/Portfolio Build â€” Developer Org', 
    desc: 'Extend your mortgage platform or campaign feature. Gives you fresh real-world examples to discuss in interviews. build something new every week.', 
    tag: 'Coding' 
  },
  { 
    time: '19:00', end: '19:30', title: 'Evening Walk â€” Mental Decompression', 
    desc: 'Short outdoor break to separate study from evening. Important for mental health and mood regulation. Fully disconnect.', 
    tag: 'Rest' 
  },
  { 
    time: '19:30', end: '20:30', title: 'Revision + Flashcard Writing (Handwritten)', 
    desc: 'Handwrite the 5 most important things learned today. Quiz yourself out loud. Handwriting + speaking aloud creates the strongest memory encoding.', 
    tag: 'Technical' 
  },
  { 
    time: '20:30', end: '22:00', title: 'Dinner + Family â€” Fully Disconnected', 
    desc: 'Consolidate learning by resting. No phone, no LinkedIn. Protect this window to allow neurological processing of the day learning.', 
    tag: 'Rest' 
  },
  { 
    time: '22:00', end: '22:30', title: 'Night Review â€” 20 Min Preview', 
    desc: 'Read only your notebook notes. Preview tomorrow topic title. Prime your brain for sleep. Dim lights and no screens after this.', 
    tag: 'Review' 
  }
];

async function renderTimetable() {
  console.log('ðŸ“… [SCHEDULE] renderTimetable() triggered');
  const container = document.getElementById('timetableContainer');
  if (!container) {
    console.error('âŒ [SCHEDULE] timetableContainer NOT FOUND in DOM!');
    return;
  }
  
  console.log('â³ [SCHEDULE] Population started...');
  container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--muted);">Loading daily schedule...</div>';

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Calculate Progress
  const startDay = 5 * 60; // 5 AM
  const endDay = 22.5 * 60; // 10:30 PM
  let progress = ((currentMinutes - startDay) / (endDay - startDay)) * 100;
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  
  const progressBar = document.getElementById('dailyProgressBar');
  const progressText = document.getElementById('dailyProgressText');
  if (progressBar) progressBar.style.width = progress + '%';
  if (progressText) progressText.textContent = progress + '%';

  try {
    const data = await getStudyData();
    console.log('ðŸ“¦ [SCHEDULE] Data received:', data);
    const completedTasks = data.completedTasks || [];

    const html = `
      <div class="timetable-container">
        ${SCHEDULE_DATA.map((item, index) => {
          const [h, m] = item.time.split(':').map(Number);
          const [eh, em] = item.end.split(':').map(Number);
          const startMin = h * 60 + m;
          const endMin = eh * 60 + em;
          
          let status = 'upcoming';
          if (currentMinutes >= startMin && currentMinutes < endMin) status = 'active';
          else if (currentMinutes >= endMin) status = 'past';

          const isDone = completedTasks.includes(index);

          return `
            <div class="timetable-item ${status} ${isDone ? 'done' : ''}" style="${isDone ? 'opacity:0.5; border-color:var(--green);' : ''}">
              ${status === 'active' ? '<div class="current-indicator"><span style="width:5px; height:5px; background:white; border-radius:50%; display:inline-block; animation: blink 1s infinite;"></span> LIVE NOW</div>' : ''}
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span class="timetable-time">${item.time} - ${item.end}</span>
                <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTask(${index})" style="width:18px; height:18px; cursor:pointer;">
              </div>
              <div class="timetable-title" style="${isDone ? 'text-decoration:line-through; color:var(--muted);' : ''}">${item.title}</div>
              <div class="timetable-desc">${item.desc}</div>
              <span class="timetable-tag">${item.tag}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.innerHTML = html;
    console.log(`âœ… [SCHEDULE] Population COMPLETE. HTML Length: ${html.length}`);
  } catch (e) {
    console.error('âŒ [SCHEDULE] Failed to render:', e);
    container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--red);">Failed to load schedule. Ensure the agent server is running.</div>';
  }
}

function switchTrackerTab(tabId) {
  console.log(`%c ðŸ“‘ [TRACKER] Switching Tab: ${tabId}`, 'color: #3b82f6; font-weight: bold;');
  // Update Buttons
  document.querySelectorAll('.tracker-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
  });
  
  // Update Content
  document.querySelectorAll('.tracker-content').forEach(content => {
    content.style.display = 'none';
  });
  const target = document.getElementById(tabId);
  if (target) {
    console.log(`ðŸ‘ï¸ [TRACKER] Showing: #${tabId}`);
    target.style.display = 'block';
  }

  // Save preference
  localStorage.setItem('last_tracker_tab', tabId);
  
  if (tabId === 'tab_leaderboard') {
    fetchLeaderboard();
  }
}

async function fetchLeaderboard() {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">Loading scholars...</span>';
  
  try {
    const response = await apiFetch('/api/study/leaderboard');
    if (!response.ok) throw new Error('Unauthorized');
    const data = await response.json();
    
    if (!data.leaderboard || data.leaderboard.length === 0) {
      container.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">No scholars found yet. Be the first!</span>';
      return;
    }
    
    container.innerHTML = data.leaderboard.map((user, index) => {
      let medal = '';
      if (index === 0) medal = 'ðŸ¥‡';
      else if (index === 1) medal = 'ðŸ¥ˆ';
      else if (index === 2) medal = 'ðŸ¥‰';
      else medal = `<span style="opacity:0.5;">#${index + 1}</span>`;
      
      const pic = user.picture ? `<img src="${user.picture}" style="width:32px; height:32px; border-radius:50%; border:2px solid var(--blue);">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--blue); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${user.name ? user.name.charAt(0) : '?'}</div>`;
      
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px 15px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; align-items:center; gap:15px;">
          <div style="font-size:1.2rem; min-width:30px; text-align:center;">${medal}</div>
          ${pic}
          <div style="font-weight:700; color:var(--text);">${user.name || 'Anonymous'}</div>
        </div>
        <div style="font-family:'IBM Plex Mono'; font-weight:700; color:var(--green);">${user.totalHours} hrs</div>
      </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<span style="color:var(--red); font-size:0.8rem;">Failed to load leaderboard.</span>';
    console.error(e);
  }
}

// --- DYNAMIC PAGE LOADING ENGINE (v1411 Modular) ---
async function ensurePageLoaded(pageId) {
    // List of pages that should be loaded dynamically
    const modularPages = [
        'job_radar', 'schedule', 'study_tracker', 'profile_match', 'study_history',
        'intro', 'speaking', 'comm', 'vocab', 'salary', 'mock',
        'behavioral', 'apex', 'soql', 'async', 'triggers', 'lwc', 'aura', 'integration', 'security',
        'domain', 'scenario', 'design', 'adv_apex', 'admin',
        'sc_objects', 'sc_recordpage', 'sc_flow', 'sc_arch', 'sc_async', 'sc_fileupload', 
        'sc_reports', 'sc_agentforce', 'sc_navmixin', 'sc_validation',
        'fde_ag_concept', 'fde_ag_scenario', 'fde_atlas', 'fde_trust',
        'fde_dc_concept', 'fde_dc_adv', 'fde_integration', 'fde_apex', 'fde_behavioral',
        'fde_cheat', 'ai_interview', 'topic_viewer', 'company_iq', 'mobigic_pwc', 'thenken_globus'
    ];

    if (!modularPages.includes(pageId)) {
        console.log(`â„¹ï¸ [LOADER] ${pageId} is a dynamic topic. Skipping modular load.`);
        return true;
    }

    console.log(`%c ðŸ” [LOADER] Checking if modular page is loaded: ${pageId}`, 'color: #a855f7; font-weight: bold;');
    const pageEl = document.getElementById(pageId);
    if (!pageEl) {
        console.error(`%c âŒ [LOADER] CRITICAL: Element not found in DOM for modular page: #${pageId}`, 'color: #ef4444; font-weight: bold;');
        return false;
    }
    
    // Audit current state
    const display = getComputedStyle(pageEl).display;
    const contentLen = pageEl.innerHTML.trim().length;
    
    console.log(`%c ðŸ“Š [LOADER] Page ${pageId} Status -> Display: ${display}, ContentLen: ${contentLen}`, 'color: #6366f1;');
    
    if (contentLen > 100) {
        console.log(`%c âœ… [LOADER] Page ${pageId} already has content. Skipping fetch.`, 'color: #10b981;');
        return true;
    }

    console.log(`ðŸ“¡ [LOADER] Fetching modular page: /pages/${pageId}.html ...`);
    try {
        const response = await fetch(`/pages/${pageId}.html?v=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const html = await response.text();
        pageEl.innerHTML = html;
        console.log(`%c âœ… [LOADER] Page ${pageId} injected successfully.`, 'color: #10b981; font-weight: bold;');
        
        // Refresh specific UI components if needed
        if (pageId === 'job_radar') fetchJobsList();
        
        return true;
    } catch (err) {
        console.error(`%c âŒ [LOADER] Failed to load page ${pageId}: ${err.message}`, 'color: #ef4444; font-weight: bold;');
        pageEl.innerHTML = `<div style="padding:2rem; color:var(--red); text-align:center;">
          <h3>Modular Load Failed</h3>
          <p>The page "${pageId}" could not be retrieved from the server. [Error: ${err.message}]</p>
          <button onclick="location.reload()" style="margin-top:1rem; padding:8px 16px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:8px; cursor:pointer;">Retry Dashboard</button>
        </div>`;
        return false;
    }
}


// Update showPage to include extreme telemetry
let isNavigating = false;
async function showPage(id) {
  if (isNavigating) return;
  isNavigating = true;
  console.log(`%c [TAB SWITCH] -> ${id}`, 'background: #3b82f6; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;');
  try {
  
  // Ensure the page content is loaded before showing
  await ensurePageLoaded(id);

  localStorage.setItem('last_active_tab', id);
  await stopTracking();
  
  console.log(`ðŸ§¹ [NAV] Hiding all .page elements...`);
  document.querySelectorAll('.page').forEach(function(p) { 
    p.classList.remove('active'); 
    p.style.setProperty('display', 'none', 'important'); 
  });
  
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  
  let page = document.getElementById(id);
  
  if (!page && !topicConfig[id]) {
    console.error(`âŒ [NAV] FATAL: Target element #${id} not found.`);
    return;
  }

  const isIndustrial = renderTopicContent(id);
  if (isIndustrial) {
      console.log(`ðŸ­ [NAV] Detected Industrial Content for: ${id}`);
      page = document.getElementById('topic_viewer');
  } else if (!page && topicConfig[id]) {
      console.log(`ðŸ“š [NAV] Routing to topic_viewer for: ${id}`);
      page = document.getElementById('topic_viewer');
  }

  if (page) { 
    console.log(`âœ¨ [NAV] ENABLING PAGE: #${page.id}`);
    page.classList.add('active');
    // Use flex for job_radar (it's a flex container), block for everything else
    if (id === 'job_radar') {
      page.style.setProperty('display', 'flex', 'important');
    } else {
      page.style.setProperty('display', 'block', 'important');
    }
    
    const finalStyle = getComputedStyle(page);
    console.log(`ðŸ“Š [NAV] #${page.id} COMPUTED STATE:
    - Display: ${finalStyle.display}
    - Visibility: ${finalStyle.visibility}
    - Height: ${finalStyle.height}
    - Opacity: ${finalStyle.opacity}`);
    
    // Init Logic
    if (id === 'schedule') {
        console.log('ðŸ“… [NAV] Rendering Timetable...');
        await renderTimetable(); 
    }
    if (id === 'study_history') {
        console.log('ðŸ“œ [NAV] Rendering History...');
        await renderHistory();
    }
    if (id === 'study_tracker') {
        console.log('ðŸ“ˆ [NAV] Initiating Study Tracker...');
        const lastTab = localStorage.getItem('last_tracker_tab') || 'tab_suggestions';
        switchTrackerTab(lastTab);
        await updateTrackerUI(); 
    }
    if (id === 'job_radar') {
        console.log('[NAV] Activating Job Radar Dashboard...');
        fetchJobsList();
        // Auto-refresh: poll every 5 minutes while tab is active
        if (window._jobRadarInterval) clearInterval(window._jobRadarInterval);
        window._jobRadarInterval = setInterval(() => {
          const radarPage = document.getElementById('job_radar');
          if (radarPage && radarPage.classList.contains('active')) {
            console.log('[RADAR] Auto-refresh triggered...');
            fetchJobsList();
          } else {
            clearInterval(window._jobRadarInterval);
            window._jobRadarInterval = null;
          }
        }, 5 * 60 * 1000);
    }
    if (id === 'profile_match') { 
        console.log('ðŸ‘¤ [NAV] Analyzing Profile Match...');
        if (cachedUserProfile) renderProfileMatchPage(cachedUserProfile); 
        else loadUserProfile(); 
    }
    if (id === 'bookmarks_page') {
        console.log('â­  [NAV] Activating Bookmarks View...');
        if (typeof showBookmarks === 'function') showBookmarks();
    }
  }

  // UI Updates
  const headerTitle = document.getElementById('headerTitle');
  if (headerTitle) headerTitle.textContent = topicConfig[id] ? topicConfig[id].name : 'SF Prep Guide';
  document.querySelectorAll('.nav-item').forEach(function(n) {
    var oc = n.getAttribute('onclick');
    if (oc && (oc.indexOf("'"+id+"'") !== -1 || oc.indexOf("\""+id+"\"") !== -1)) n.classList.add('active');
  });
  const mainEl = document.getElementById('main');
  if (mainEl) mainEl.scrollTop = 0;
  
  // Mobile Sidebar Close (guard against double-toggle)
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
    if (sidebarOverlay) sidebarOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  const cfg = topicConfig[id];
  if (cfg && !cfg.noTimer) startTracking(id);
  renderBookmarkButtons();

  } catch (err) {
    console.error('[NAV] showPage() error:', err);
  } finally {
    isNavigating = false;
  }
}
function toggleQA(el) { 
  const isOpen = el.parentElement.classList.toggle('open'); 
  if (isOpen && currentTrackedPage) {
    localStorage.setItem('last_q_' + currentTrackedPage, el.querySelector('.qa-q-text').textContent);
  }
}
function toggleStar(el) { el.parentElement.classList.toggle('open'); }

// Init
document.querySelectorAll('.page').forEach(function(p) {
  if (!p.classList.contains('active')) p.style.display = 'none';
});
document.getElementById('searchPage').style.display = 'none';

// Search index
var searchData = [];
document.querySelectorAll('.qa-block').forEach(function(block) {
  var q = block.querySelector('.qa-q-text');
  var page = block.closest('.page');
  if (q && page) searchData.push({ question: q.textContent.trim(), answerEl: block, pageId: page.id, pageName: page.querySelector('.page-title') ? page.querySelector('.page-title').textContent : '' });
});

function filterSidebar(val) {
  const query = val.toLowerCase().trim();
  const items = document.querySelectorAll('#sidebar .nav-item');
  const sections = document.querySelectorAll('#sidebar .nav-parent-section');
  const sectionTitles = document.querySelectorAll('#sidebar .nav-parent-title');
  
  if (!query) {
    items.forEach(el => el.style.display = 'flex');
    sections.forEach(el => el.style.display = 'block');
    sectionTitles.forEach(el => el.style.display = 'block');
    return;
  }

  // Hide all titles initially
  sectionTitles.forEach(el => el.style.display = 'none');

  sections.forEach(section => {
    const navItems = section.querySelectorAll('.nav-item');
    let hasMatch = false;
    
    navItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = 'flex';
        hasMatch = true;
      } else {
        item.style.display = 'none';
      }
    });

    if (hasMatch) {
      section.style.display = 'block';
      const title = section.querySelector('.nav-parent-title');
      if (title) title.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  });

  // Handle revision alerts visibility
  const revAlerts = document.getElementById('revisionAlerts');
  if (revAlerts) {
    if (query) revAlerts.style.display = 'none';
    else revAlerts.style.display = 'block';
  }

  // Also filter standalone titles if any (like "100 Scenario Mix")
  sectionTitles.forEach(title => {
    if (title.textContent.toLowerCase().includes(query)) {
      title.style.display = 'block';
    }
  });
}

function searchContent(val) {
  if (!val || val.length < 2) { document.getElementById('searchPage').style.display = 'none'; return; }
  var lower = val.toLowerCase();
  var results = searchData.filter(function(d) { return d.question.toLowerCase().indexOf(lower) !== -1 || (d.answerEl.textContent||'').toLowerCase().indexOf(lower) !== -1; });
  var container = document.getElementById('searchResults');
  var sp = document.getElementById('searchPage');
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
  sp.style.display = 'block'; sp.classList.add('active');
  if (!results.length) { container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No results for "'+val+'"</p>'; return; }
  container.innerHTML = results.map(function(r) {
    var idx = searchData.indexOf(r);
    return '<div class="search-result-item" onclick="goToResult(\''+r.pageId+'\','+idx+')"><div class="sr-q">'+r.question+'</div><div class="sr-section">'+r.pageName+'</div></div>';
  }).join('');
}

function goToResult(pageId, idx) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchPage').style.display = 'none';
  showPage(pageId);
  setTimeout(function() { 
    if (searchData[idx] && searchData[idx].answerEl) { 
      searchData[idx].answerEl.scrollIntoView({behavior:'smooth',block:'center'}); 
      searchData[idx].answerEl.classList.add('open'); 
      renderBookmarkButtons(); // Ensure bookmark star is visible (v1340)
    } 
  }, 200);
}

// cachedHistories declared at top with other globals

async function showHistoryModal(date) {
  const h = cachedHistories[date];
  if (!h) {
    alert('No data found for this date. Please click Sync Dashboard first.');
    return;
  }

  const modal = document.getElementById('historyModal');
  const dateEl = document.getElementById('modalDate');
  const body = document.getElementById('modalBody');
  
  dateEl.textContent = date;
  modal.classList.add('active');
  modal.style.display = 'flex';

  const sData = h.study || {};
  const b = sData.breakdown || sData.topicBreakdown || {};
  const topicList = Object.keys(b).map(tid => ({
    id: tid,
    name: b[tid].name || tid,
    totalSeconds: b[tid].totalSeconds || 0
  }));

  let topicHtml = '';
  
  if (topicList.length > 0) {
    topicList.forEach(t => {
      const id = t.id;
      const name = t.name;
      const spent = t.totalSeconds || 0;
      const cfg = topicConfig[id] || { recommended: 60 };
      const target = cfg.recommended * 60;
      const pct = Math.min((spent / target) * 100, 100);

      topicHtml += `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:32px; height:32px; background:rgba(79,142,247,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--blue); font-size:1rem;">ðŸ“š</div>
              <div>
                <div style="font-size:0.9rem; font-weight:700; color:var(--text);">${name}</div>
                <div style="font-size:0.7rem; color:var(--muted); font-family:'IBM Plex Mono';">SPENT: ${formatTime(spent)}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.85rem; font-weight:700; color:var(--blue);">${Math.round(pct)}%</div>
              <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Goal: ${Math.round(target/60)}m</div>
            </div>
          </div>
          <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
            <div style="height:100%; width:${Math.max(pct, 2)}%; background:linear-gradient(90deg, var(--blue), #60a5fa);"></div>
          </div>
        </div>`;
    });
  } else {
    topicHtml = `<div style="text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed var(--border);">
      <div style="font-size:1.1rem; font-weight:700; color:var(--text); margin-bottom:5px;">Study Session</div>
      <div style="font-size:0.8rem; color:var(--muted);">No specific topics were logged for this date.</div>
    </div>`;
  }
  
  const jobsHtml = h.jobs && h.jobs.topMatches && h.jobs.topMatches.length > 0 ? 
    h.jobs.topMatches.map(j => `<div style="padding:10px; background:rgba(255,255,255,0.02); border-radius:8px; margin-bottom:8px; font-size:0.8rem; border-left:3px solid var(--green);"><b>${j.title}</b> at ${j.company}</div>`).join('') :
    '<div style="color:var(--muted); font-size:0.8rem;">No high-score matches found in this period.</div>';

  body.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:2rem;">
      <div style="background:rgba(79,142,247,0.1); padding:1rem; border-radius:12px; text-align:center;">
        <div style="font-size:0.65rem; color:var(--blue); text-transform:uppercase; margin-bottom:5px;">Total Duration</div>
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:\'IBM Plex Mono\';">${formatTime(h.study.totalSeconds)}</div>
      </div>
      <div style="background:rgba(61,214,140,0.1); padding:1rem; border-radius:12px; text-align:center;">
        <div style="font-size:0.65rem; color:var(--green); text-transform:uppercase; margin-bottom:5px;">Radar Hits</div>
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:\'IBM Plex Mono\';">+${h.jobs ? h.jobs.newCount : 0}</div>
      </div>
    </div>

    <h4 style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:1.2rem;">Detailed Subject Breakdown</h4>
    ${topicHtml}

    <h4 style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin:2rem 0 1rem;">Radar Insights (Top Matches)</h4>
    ${jobsHtml}
  `;

  modal.style.display = 'flex';
}

function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

// BROADCAST HANDSHAKE: Auto-refresh dashboard when sync tab closes
window.addEventListener('storage', (e) => {
  if (e.key === 'profile_sync_success') {
    console.log('ðŸ”„ Profile sync detected from external tab. Refreshing...');
    syncDashboard();
  }
});

function openSyncModal() {
  document.getElementById('syncModal').style.display = 'flex';
  if (cachedUserProfile) updateSyncModalUI(cachedUserProfile);
}

function updateSyncModalUI(profile) {
  const p = profile.platforms || {};
  const liCard = document.getElementById('modalSyncLinkedIn');
  const nkCard = document.getElementById('modalSyncNaukri');

  if (p.linkedin && p.linkedin.synced) {
      document.getElementById('liSyncLabel').textContent = 'Last Synced: Today';
      document.getElementById('liSyncStatus').innerHTML = 'OK Linked';
      if (liCard) {
        liCard.style.borderColor = '#10b981';
        liCard.style.background = 'rgba(16,185,129,0.05)';
        liCard.style.pointerEvents = 'none';
        liCard.style.opacity = '0.8';
      }
  } else {
      document.getElementById('liSyncLabel').textContent = 'Not Linked';
      document.getElementById('liSyncStatus').textContent = 'Sync Now â†’';
      if (liCard) {
        liCard.style.borderColor = 'rgba(0,119,181,0.2)';
        liCard.style.background = 'rgba(0,119,181,0.05)';
        liCard.style.pointerEvents = 'auto';
        liCard.style.opacity = '1';
      }
  }

  if (p.naukri && p.naukri.synced) {
      document.getElementById('nkSyncLabel').textContent = 'Last Synced: Today';
      document.getElementById('nkSyncStatus').innerHTML = 'OK Linked';
      if (nkCard) {
        nkCard.style.borderColor = '#10b981';
        nkCard.style.background = 'rgba(16,185,129,0.05)';
        nkCard.style.pointerEvents = 'none';
        nkCard.style.opacity = '0.8';
      }
  } else {
      document.getElementById('nkSyncLabel').textContent = 'Not Linked';
      document.getElementById('nkSyncStatus').textContent = 'Sync Now â†’';
      if (nkCard) {
        nkCard.style.borderColor = 'rgba(255,117,85,0.2)';
        nkCard.style.background = 'rgba(255,117,85,0.05)';
        nkCard.style.pointerEvents = 'auto';
        nkCard.style.opacity = '1';
      }
  }
}

function closeSyncModal() {
  document.getElementById('syncModal').style.display = 'none';
}

function updateSidebarProfileStatus(profile) {
  const platforms = profile.platforms || {};
  const count = Object.keys(platforms).length;
  const countEl = document.getElementById('syncPlatformCount');
  const statusEl = document.getElementById('sidebarSyncStatus');
  
  if (countEl) countEl.textContent = count + ' Linked';
  
  if (statusEl) {
    if (count === 0) {
        statusEl.innerHTML = '<div style="font-size:0.72rem; color:var(--muted); font-style:italic; text-align:center; padding:10px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed rgba(255,255,255,0.1);">No platforms linked yet</div>';
    } else {
        let badges = '';
        if (platforms.linkedin && platforms.linkedin.synced) {
            badges += '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(0,119,181,0.08); border:1px solid rgba(0,119,181,0.2); border-radius:10px; font-size:0.72rem; color:#60a5fa;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg> LinkedIn Linked</div>';
        }
        if (platforms.naukri && platforms.naukri.synced) {
            badges += '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(255,117,85,0.08); border:1px solid rgba(255,117,85,0.2); border-radius:10px; font-size:0.72rem; color:#fb923c;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 9H8v-1h4v1zm6-3H8v-1h10v1zm0-3H8V8h10v1z"/></svg> Naukri Linked</div>';
        }
        statusEl.innerHTML = badges;
    }
  }
}

// Lifecycle
window.addEventListener('beforeunload', function() { stopTracking(); });
document.addEventListener('visibilitychange', function() {
  if (document.hidden && currentTrackedPage && !isPaused) {
    // Auto-pause when tab is hidden
    togglePause();
  }
});

// Boot
(async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  const lastTab = localStorage.getItem('last_active_tab') || 'schedule';
  showPage(lastTab);
  
  try {
    await Promise.all([
      fetchJobsList(),
      renderHistory(),
      loadUserProfile()
    ]);
  } catch(e) { console.warn('Background preload partially failed', e); }
})();
// AI INTERVIEW SYSTEM
let interviewMessages = [];

async function startAIInterview() {
  const topic = document.getElementById('interviewTopic').value;
  const difficulty = document.getElementById('interviewDifficulty').value;
  
  const chatContainer = document.getElementById('interviewChat');
  chatContainer.innerHTML = '';
  document.getElementById('interviewInputArea').style.display = 'block';
  document.getElementById('interviewSetup').style.opacity = '0.5';
  document.getElementById('interviewSetup').style.pointerEvents = 'none';

  addChatMessage('ai', `Hello! I am your AI Interviewer. We will be discussing ${topic} at a ${difficulty} level today. Let's begin. <br><br><b>First Question:</b> Can you tell me about your experience with ${topic} and how you handle complex requirements in this area?`);
}

async function submitAnswer() {
  const input = document.getElementById('userAnswerInput');
  const answer = input.value.trim();
  if (!answer) return;

  addChatMessage('user', answer);
  input.value = '';
  
  const statusEl = document.getElementById('aiThinkingStatus');
  statusEl.style.display = 'inline';

  try {
    const topic = document.getElementById('interviewTopic').value;
    const difficulty = document.getElementById('interviewDifficulty').value;
    
    const systemPrompt = `You are a Senior Salesforce Technical Interviewer. 
Topic: ${topic}. Difficulty: ${difficulty}.
Conduct a realistic interview. Ask one technical question at a time. 
When the user answers, provide brief feedback (Score 1-10) and then ask the next follow-up question.
Be professional and challenging. 
User Input: ${answer}`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:e4b', // Using the specified Gemma 4 model
        prompt: systemPrompt,
        stream: false
      })
    });
    
    if (!res.ok) throw new Error('Local AI not responding. Ensure Ollama is running.');
    
    const data = await res.json();
    statusEl.style.display = 'none';
    addChatMessage('ai', data.response);
    
  } catch (e) {
    statusEl.style.display = 'none';
    addChatMessage('ai', 'Failed to connect to local AI engine. Please ensure Ollama is running on your machine and OLLAMA_ORIGINS="*" is set if accessing via Vercel.');
    console.error('AI Interview Error:', e);
  }
}

function addChatMessage(role, text) {
  const container = document.getElementById('interviewChat');
  const msg = document.createElement('div');
  msg.style.padding = '1rem';
  msg.style.borderRadius = '12px';
  msg.style.maxWidth = '85%';
  msg.style.lineHeight = '1.6';
  
  if (role === 'ai') {
    msg.style.alignSelf = 'flex-start';
    msg.style.background = 'rgba(79,142,247,0.1)';
    msg.style.borderLeft = '4px solid var(--blue)';
    msg.style.color = 'var(--text)';
  } else {
    msg.style.alignSelf = 'flex-end';
    msg.style.background = 'var(--blue)';
    msg.style.color = 'white';
  }
  
  msg.innerHTML = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  
  if (role === 'ai') {
    speakText(text);
  }
}

let speechRec = null;
let isRecording = false;

function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Voice recognition is not supported in this browser. Please use Chrome or Edge.");
    return;
  }

  const micBtn = document.getElementById('micBtn');
  const input = document.getElementById('userAnswerInput');

  if (isRecording) {
    if (speechRec) speechRec.stop();
    return;
  }

  speechRec = new SpeechRecognition();
  speechRec.continuous = true;
  speechRec.interimResults = true;
  speechRec.lang = 'en-US';

  speechRec.onstart = function() {
    isRecording = true;
    if (micBtn) {
      micBtn.style.background = 'var(--red)';
      micBtn.style.color = 'white';
      micBtn.style.boxShadow = '0 0 15px rgba(255, 59, 48, 0.5)';
      micBtn.textContent = 'Stop';
    }
    if (input) input.placeholder = "Listening... Speak your answer now.";
  };

  speechRec.onresult = function(event) {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript) {
      input.value += (input.value ? ' ' : '') + finalTranscript;
    }
  };

  speechRec.onerror = function(e) {
    console.error('Speech recognition error', e);
    stopRecordingUI();
  };

  speechRec.onend = function() {
    stopRecordingUI();
  };

  speechRec.start();
}

function stopRecordingUI() {
  isRecording = false;
  const micBtn = document.getElementById('micBtn');
  const input = document.getElementById('userAnswerInput');
  if (micBtn) {
    micBtn.style.background = 'var(--card)';
    micBtn.style.color = 'var(--text)';
    micBtn.style.boxShadow = 'none';
    micBtn.textContent = 'Mic';
  }
  if (input) {
    input.placeholder = "Type or speak your answer here...";
  }
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop current speech if any
  
  // Strip HTML and Markdown for cleaner speech
  const cleanText = text.replace(/<[^>]*>?/gm, '').replace(/\*/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  // Try to pick a professional voice
  const voices = window.speechSynthesis.getVoices();
  const proVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
  if (proVoice) utterance.voice = proVoice;
  
  utterance.rate = 1.05;
  utterance.pitch = 0.95;
  window.speechSynthesis.speak(utterance);
}

// Support Ctrl+Enter to submit
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'userAnswerInput') {
    submitAnswer();
  }
});

// =============================================
// STUDY STREAKS ENGINE (v1340)
// =============================================
function updateStudyStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (studyStreak.lastDate === today) return; // Already updated today
  
  if (studyStreak.lastDate === yesterday) {
    studyStreak.current += 1;
  } else if (studyStreak.lastDate !== today) {
    studyStreak.current = 1; // Reset streak
  }
  
  if (studyStreak.current > studyStreak.best) {
    studyStreak.best = studyStreak.current;
  }
  
  studyStreak.lastDate = today;
  renderStreakBadge();
  
  // Cloud Sync (v1356 - Pure MongoDB)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/save', {
      method: 'POST',
      body: JSON.stringify({ studyStreak })
    }).catch(e => console.error('Streak cloud sync failed', e));
  }
}

function renderStreakBadge() {
  const sidebarBadge = document.getElementById('streakBadge');
  const floatBadge = document.getElementById('floatStreakBadge');
  const floatVal = document.getElementById('floatStreakVal');
  
  const current = studyStreak.current || 0;
  const flameSvg = `<svg viewBox="0 0 24 24" fill="var(--orange)" stroke="var(--orange)" stroke-width="2" style="width:14px;height:14px; vertical-align:middle; filter:drop-shadow(0 0 5px rgba(249,115,22,0.4));"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
  
  // Update Sidebar
  if (sidebarBadge) {
    sidebarBadge.innerHTML = `<span>${flameSvg}</span> ${current} day${current !== 1 ? 's' : ''}`;
    sidebarBadge.style.display = current > 0 ? 'inline-flex' : 'none';
  }
  
  // Update Header Pill
  if (floatBadge) {
    floatBadge.style.display = current > 0 ? 'flex' : 'none';
    if (floatVal) floatVal.textContent = current;
  }
}

// Hook into stopTracking to update streaks and retention (v1354)
const _originalStopTracking = stopTracking;
stopTracking = async function() {
  const tid = currentTrackedPage;
  const startTime = trackingStartTime;
  const pausedTime = pausedElapsed;
  
  await _originalStopTracking();
  updateStudyStreak();
  
  // Calculate spent time for feedback logic
  if (startTime) {
    const spentSeconds = Math.floor((Date.now() - startTime - pausedTime) / 1000);
    const stats = userRetention[tid];
    const isDue = !stats || new Date(stats.nextReview) <= new Date();
    
    // ONLY ask for feedback if topic is due AND studied > 30s AND not already asked in this session (v1354)
    if (topicConfig[tid] && !topicConfig[tid].noTimer && isDue && spentSeconds > 30 && !sessionFeedbackProvided.has(tid)) {
      currentRetentionTopicId = tid;
      document.getElementById('confidenceModal').style.display = 'flex';
    }
  }
};

// =============================================
// BOOKMARK SYSTEM (v1340)
// =============================================
function toggleBookmark(questionText, topicId) {
  const idx = userBookmarks.findIndex(b => b.q === questionText);
  if (idx >= 0) {
    userBookmarks.splice(idx, 1);
  } else {
    userBookmarks.push({ q: questionText, topic: topicId, date: new Date().toISOString() });
  }
  localStorage.setItem('sf_bookmarks', JSON.stringify(userBookmarks));
  renderBookmarkButtons();
  
  // Update bookmark count in sidebar
  const countEl = document.getElementById('bookmarkCount');
  if (countEl) countEl.textContent = userBookmarks.length;

  // Cloud Sync (v1340)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/toggle-bookmark', {
      method: 'POST',
      body: JSON.stringify({ q: questionText, topic: topicId })
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        userBookmarks = data.bookmarks;
        localStorage.setItem('sf_bookmarks', JSON.stringify(userBookmarks));
        renderBookmarkButtons();
        if (countEl) countEl.textContent = userBookmarks.length;
      }
    }).catch(e => console.error('Bookmark cloud sync failed', e));
  }
}

function isBookmarked(questionText) {
  return userBookmarks.some(b => b.q === questionText);
}

function renderBookmarkButtons() {
  document.querySelectorAll('.qa-question').forEach(qEl => {
    const qText = qEl.querySelector('.qa-q-text')?.textContent;
    if (!qText) return;
    
    let btn = qEl.querySelector('.bookmark-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.className = 'bookmark-btn';
      btn.style.cssText = 'cursor:pointer; display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; flex-shrink:0; margin-left:4px; transition:all 0.2s;';
      btn.onclick = function(e) {
        e.stopPropagation();
        const page = qEl.closest('.page');
        const topicId = page ? page.id : 'unknown';
        toggleBookmark(qText, topicId);
      };
      qEl.insertBefore(btn, qEl.querySelector('.qa-chevron'));
    }
    
    const active = isBookmarked(qText);
    btn.innerHTML = active ? 
      `<svg viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="2" style="width:14px;height:14px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` :
      `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="width:14px;height:14px;opacity:0.5;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    
    btn.style.background = active ? 'rgba(244,197,66,0.1)' : 'transparent';
    btn.title = active ? 'Remove bookmark' : 'Bookmark this question';
  });
}

function showBookmarks() {
  console.log('ðŸ“– [UI] Rendering Bookmarks Page. Current Count:', userBookmarks.length);
  showPage('bookmarks_page');
  const container = document.getElementById('bookmarksContent');
  if (!container) {
    console.error('â Œ [UI] #bookmarksContent element missing!');
    return;
  }

  // If we haven't loaded profile yet, show loading state
  if (!cachedUserProfile && userBookmarks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--muted);">
        <div class="spin" style="width:32px; height:32px; border:2px solid var(--blue); border-top-color:transparent; border-radius:50%; margin:0 auto 16px;"></div>
        <div>Loading your cloud bookmarks...</div>
      </div>`;
    return;
  }
  
  if (userBookmarks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <div style="width:64px; height:64px; margin:0 auto 20px; opacity:0.1; color:var(--text);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <div style="font-weight:700; color:var(--text); margin-bottom:8px;">No Bookmarks Yet</div>
        <p style="font-size:0.82rem; color:var(--muted); max-width:400px; margin:0 auto;">Click the star icon on any question to bookmark it for quick revision. Your bookmarks are saved in the cloud.</p>
      </div>`;
    return;
  }
  
  let html = `<div style="font-size:0.75rem; color:var(--muted); margin-bottom:16px; font-weight:600; text-transform:uppercase; letter-spacing:1px;">${userBookmarks.length} SAVED QUESTIONS</div>`;
  userBookmarks.forEach((b, i) => {
    const topicName = topicConfig[b.topic] ? topicConfig[b.topic].name : b.topic;
    html += `
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:12px; display:flex; align-items:flex-start; gap:16px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden;" onclick="showPage('${b.topic}')" onmouseenter="this.style.borderColor='var(--blue)'; this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.borderColor='var(--border)'; this.style.background='rgba(255,255,255,0.02)'">
        <div style="color:var(--amber); flex-shrink:0; margin-top:2px;">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:0.95rem; color:var(--text); line-height:1.5; margin-bottom:6px;">${b.q}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.65rem; background:rgba(79,142,247,0.1); color:var(--blue); padding:3px 10px; border-radius:10px; font-weight:700; text-transform:uppercase;">${topicName}</span>
            <span style="font-size:0.65rem; color:var(--muted); font-family:'IBM Plex Mono',monospace;">Saved: ${new Date(b.date).toLocaleDateString()}</span>
          </div>
        </div>
        <button onclick="event.stopPropagation(); toggleBookmark('${b.q.replace(/'/g, "\\'")}', '${b.topic}'); showBookmarks();" style="cursor:pointer; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:6px; color:#ef4444; display:flex; align-items:center; justify-content:center; transition:0.2s;" onmouseenter="this.style.background='var(--red)'; this.style.color='white'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>`;
  });
  container.innerHTML = html;
}

// =============================================
// MOBILE SIDEBAR TOGGLE (v1340)
// =============================================
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    sidebar.classList.remove('mobile-open');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }
    document.body.style.overflow = '';
  } else {
    sidebar.classList.add('mobile-open');
    if (overlay) {
      overlay.style.display = 'block';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    }
    document.body.style.overflow = 'hidden';
  }
}

// =============================================
// RETENTION INTELLIGENCE (v1342)
// =============================================
async function saveRetention(q) {
  const topicId = currentRetentionTopicId;
  if (!topicId) return;
  
  document.getElementById('confidenceModal').style.display = 'none';
  sessionFeedbackProvided.add(topicId);
  
  // SM-2 Algorithm (Simplified for Industrial Study)
  let stats = userRetention[topicId] || { interval: 0, easeFactor: 2.5 };
  
  if (q >= 3) {
    if (stats.interval === 0) stats.interval = 1;
    else if (stats.interval === 1) stats.interval = 6;
    else stats.interval = Math.round(stats.interval * stats.easeFactor);
    
    stats.easeFactor = stats.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (stats.easeFactor < 1.3) stats.easeFactor = 1.3;
  } else {
    stats.interval = 1;
    stats.easeFactor = 2.5;
  }
  
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + stats.interval);
  
  stats.confidence = q;
  stats.nextReview = nextReview.toISOString();
  
  userRetention[topicId] = stats;
  // Cloud Sync (v1356 - Pure MongoDB)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/save-retention', {
      method: 'POST',
      body: JSON.stringify({ topicId, stats })
    }).catch(e => console.error('Retention cloud sync failed', e));
  }
  
  console.log(`ðŸ§  Spaced Repetition: Topic [${topicId}] scheduled for ${stats.interval} days.`);
  renderRevisionAlerts();
}

function renderRevisionAlerts() {
  const container = document.getElementById('revisionAlerts');
  if (!container) return;
  
  const today = new Date();
  const due = Object.entries(userRetention).filter(([id, s]) => {
    return new Date(s.nextReview) <= today;
  });
  
  if (due.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  let html = `<div style="font-size:0.7rem; color:var(--purple); font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
    <span class="active-indicator" style="background:var(--purple);"></span> RECOMMENDED REVISIONS
  </div>`;
  
  due.forEach(([id, s]) => {
    const name = topicConfig[id] ? topicConfig[id].name : id;
    html += `
      <div onclick="showPage('${id}')" style="background:rgba(167,139,250,0.08); border:1px solid rgba(167,139,250,0.2); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; transition:all 0.2s;" onmouseenter="this.style.background='rgba(167,139,250,0.15)'" onmouseleave="this.style.background='rgba(167,139,250,0.08)'">
        <div style="font-size:0.8rem; font-weight:600; color:var(--text);">${name}</div>
        <div style="font-size:0.65rem; color:var(--purple); font-family:'IBM Plex Mono',monospace;">Due Now</div>
      </div>`;
  });
  container.innerHTML = html;
}

// =============================================
// JOB RADAR PHASE 2-5 FUNCTIONS (v1399)
// =============================================
function savePipeline() {
  localStorage.setItem('sfpipe2026v3', JSON.stringify(pipelineJobs));
  updateAnalytics();
  checkOfferComparison();
  if (currentRadarSubTab === 'insights') renderInsights();
}

function logActivity(text, type = 'info') {
  const entry = {
    id: 'log_' + Date.now(),
    text,
    type,
    timestamp: new Date().toISOString()
  };
  activityLog.unshift(entry);
  if (activityLog.length > 100) activityLog.pop();
  localStorage.setItem('sfActivityLog', JSON.stringify(activityLog));
  renderLog();
}

function renderLog() {
  const body = document.getElementById('logBody');
  if (!body) return;
  body.innerHTML = activityLog.map(log => `
    <div class="log-entry">
      <div class="log-entry-meta">
        <span>${new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        <span style="color:${log.type==='success'?'var(--green)':log.type==='ai'?'var(--blue)':'var(--muted)'}">${log.type.toUpperCase()}</span>
      </div>
      <div class="log-entry-text">${log.text}</div>
    </div>
  `).join('');
}

function toggleLog() {
  const panel = document.getElementById('logPanel');
  renderLog();
  if (panel) panel.classList.toggle('open');
}

let radarBoardLimits = { todo: 10, applied: 10, interview: 10, offer: 10, rejected: 10 };

function renderBoard() {
  const cols = ['todo', 'applied', 'interview', 'offer', 'rejected'];
  const searchTerm = getBoardSearchTerm();

  cols.forEach(col => {
    const list = document.getElementById(`list-${col}`);
    const count = document.getElementById(`count-${col}`);
    const cntHeader = document.getElementById(`cnt-${col}`);
    if (!list) return;

    const filtered = pipelineJobs
      .filter(j => j.status === col)
      .filter(j => currentBoardFilter === 'all' || j.prob === currentBoardFilter)
      .filter(j => jobMatchesBoardSearch(j, searchTerm))
      .sort(sortBoardJobs);

    if (count) count.textContent = filtered.length;
    if (cntHeader) cntHeader.textContent = filtered.length;

    const limit = radarBoardLimits[col];
    const displayJobs = filtered.slice(0, limit);
    
    let html = displayJobs.length === 0 ? 
      `<div class="radar-empty-state">No matching roles in this stage.</div>` :
      displayJobs.map(job => renderJobCard(job)).join('');
      
    if (filtered.length > limit) {
      html += `
        <button style="width:100%; margin-top:12px; border:1px solid var(--border); background:var(--surface2); color:var(--text2); font-size:0.65rem; font-weight:700; padding:8px; border-radius:8px; cursor:pointer;" 
                onclick="loadMoreJobs('${col}')">
          LOAD ${filtered.length - limit} MORE
        </button>
      `;
    }
    
    list.innerHTML = html;
  });
  updateAnalytics();
  checkOfferComparison();
}

function loadMoreJobs(col) {
  radarBoardLimits[col] = 1000; 
  renderBoard();
}

function scrollToCol(id) {
  const el = document.getElementById("col-" + id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
}

function setBoardFilter(val, btn) {
  currentBoardFilter = val;
  document.querySelectorAll(".fb").forEach(b => b.classList.remove("on"));
  if (btn) btn.classList.add("on");
  renderBoard();
}

function doBoardSearch() {
  currentBoardSearch = document.getElementById("boardSearch")?.value || '';
  renderBoard();
}

function renderJobCard(job) {
  const followUp = getFollowUpStatus(job);
  const score = Number(job.score || 75);
  const scoreColor = score >= 85 ? 'var(--green)' : (score >= 70 ? 'var(--blue)' : 'var(--amber)');
  const probability = getProbabilityMeta(job.prob || 'medium');
  const actions = getActionSetForJob(job);
  const matchedSkills = (job.skills || job.matched_skills || []).slice(0, 4);
  const gapSkills = (job.missing_skills || []).slice(0, 3);
  const resumeActions = (job.resume_actions || []).slice(0, 2);
  const createdAt = job.created_at ? new Date(job.created_at) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
    ? createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Recent';

  return `
    <div class="jcard-v3" id="card-${job.id}" data-prob="${job.prob || 'medium'}">
      <div class="jcard-top">
        <div class="jcard-company-block">
           <div class="jcard-icon">${escapeHtml(job.icon || 'SF')}</div>
           <div class="jcard-company-copy">
             <span class="jcard-company">${escapeHtml(job.company)}</span>
             <span class="jcard-company-type">${escapeHtml(job.company_type || 'MNC')}</span>
           </div>
        </div>
        <div class="goal-ring-v3 score-chip" style="position:relative;">
           <svg viewBox="0 0 36 36" style="width:100%; height:100%;">
              <circle class="goal-track" cx="18" cy="18" r="15.9"/>
              <circle class="goal-arc" cx="18" cy="18" r="15.9" style="stroke-dasharray: ${score} 100; stroke: ${scoreColor};"/>
           </svg>
           <div class="score-chip-value">${score}</div>
        </div>
      </div>

      <div class="jcard-stage-row">
        <span class="prob-badge ${probability.cls}">${probability.label}</span>
        <span class="jcard-age">Added ${escapeHtml(createdLabel)}</span>
      </div>

      <div class="jcard-role">${escapeHtml(job.role)}</div>

      ${followUp && job.status === 'applied' ? `
        <div class="followup-inline ${followUp.class}">${escapeHtml(followUp.label)}</div>
      ` : ''}

      <div class="jcard-meta-grid">
        <span class="meta-pill">Location: <b>${escapeHtml(job.loc || 'India')}</b></span>
        <span class="meta-pill">Experience: <b>${escapeHtml(job.experience || '3-5 Yrs')}</b></span>
        <span class="meta-pill">Comp: <b>${escapeHtml(job.sal || 'Competitive')}</b></span>
      </div>

      ${matchedSkills.length ? `
        <div class="jcard-skill-row">
          ${matchedSkills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}
        </div>
      ` : ''}

      ${gapSkills.length ? `
        <div class="jcard-skill-row gaps">
          ${gapSkills.map(skill => `<span class="skill-gap-tag" onclick="showPage('profile_match')">${escapeHtml(skill)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="jcard-why">
        <strong>Why this role:</strong> ${escapeHtml(job.why_apply || 'Matches your profile requirements.')}
      </div>

      ${resumeActions.length ? `
        <div class="jcard-resume">
          <div class="jcard-resume-title">AI resume actions</div>
          <ul class="jcard-resume-list">
            ${resumeActions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="jcard-actions">
        ${actions.map(action => action.href
          ? `<a href="${action.href}" target="_blank" rel="noopener noreferrer" class="jcard-btn ${action.cls}">${escapeHtml(action.label)}</a>`
          : `<button class="jcard-btn ${action.cls}" onclick="${action.onClick}">${escapeHtml(action.label)}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function getFollowUpStatus(job) {
  if (job.status !== 'applied' || !job.dateApplied) return null;
  const days = Math.floor((new Date() - new Date(job.dateApplied)) / (1000 * 60 * 60 * 24));
  if (days >= 21) return { label: 'GHOSTED?', class: 'ghost' };
  if (days >= 14) return { label: 'URGENT', class: 'urgent' };
  if (days >= 7) return { label: 'FOLLOW-UP', class: 'warn' };
  return null;
}

function moveTo(id, newStatus) {
  const job = pipelineJobs.find(j => j.id === id);
  if (!job) return;
  const oldStatus = job.status;
  job.status = newStatus;
  if (newStatus === 'applied') job.dateApplied = new Date().toISOString();
  savePipeline();
  renderBoard();
  logActivity(`Moved <strong>${job.company}</strong> from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}`, 'success');
  if (newStatus === 'applied') showToast('Application recorded.');
}

function switchRadarSubTab(tab) {
  currentRadarSubTab = tab;
  document.querySelectorAll('.radar-tab-btn').forEach(b => {
    b.classList.remove('active');
    b.style.color = 'var(--muted)';
    b.style.borderBottomColor = 'transparent';
  });
  const btn = document.getElementById('tab-' + tab);
  if (btn) {
    btn.classList.add('active');
    btn.style.color = 'var(--text)';
    btn.style.borderBottomColor = 'var(--blue)';
  }

  const pipelineView = document.getElementById('radar-pipeline-view');
  const insightsView = document.getElementById('radar-insights-view');
  const developmentView = document.getElementById('radar-development-view');
  
  if (pipelineView) pipelineView.style.display = tab === 'pipeline' ? 'block' : 'none';
  if (insightsView) insightsView.style.display = tab === 'insights' ? 'block' : 'none';
  if (developmentView) developmentView.style.display = tab === 'development' ? 'block' : 'none';
  
  if (tab === 'insights') renderInsights();
  if (tab === 'development') renderDevelopment();
}

function renderInsights() {
  const funnel = document.getElementById('funnel-container');
  const dist = document.getElementById('dist-container');
  const velocity = document.getElementById('velocity-container');
  if (!funnel || !dist || !velocity) return;

  // 1. Funnel (Phase 5A)
  const stages = [
    { label: 'TO APPLY', count: pipelineJobs.filter(j => j.status === 'todo').length, color: 'var(--blue)' },
    { label: 'APPLIED', count: pipelineJobs.filter(j => j.status === 'applied').length, color: 'var(--green)' },
    { label: 'INTERVIEW', count: pipelineJobs.filter(j => j.status === 'interview').length, color: 'var(--amber)' },
    { label: 'OFFER', count: pipelineJobs.filter(j => j.status === 'offer').length, color: 'var(--pink)' }
  ];
  const max = Math.max(...stages.map(s => s.count), 1);
  funnel.innerHTML = stages.map(s => `
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:70px; font-size:0.6rem; color:var(--muted); font-weight:800;">${s.label}</div>
      <div style="flex:1; background:rgba(255,255,255,0.03); height:12px; border-radius:6px; overflow:hidden;">
        <div style="background:${s.color}; height:100%; width:${(s.count/max)*100}%; transition:width 1s ease;"></div>
      </div>
      <div style="width:20px; font-size:0.75rem; font-weight:800;">${s.count}</div>
    </div>
  `).join('');

  // 2. Segment Distribution (Phase 5C)
  const segments = {
    'Service-Based': pipelineJobs.filter(j => ['Cognizant', 'TCS', 'Infosys', 'Wipro'].some(c => j.company.includes(c))).length,
    'Product/SaaS': pipelineJobs.filter(j => ['Salesforce', 'Google', 'Amazon', 'Veeva'].some(c => j.company.includes(c))).length,
    'FinTech/BFSI': pipelineJobs.filter(j => ['HDFC', 'Barclays', 'HSBC', 'Standard'].some(c => j.company.includes(c))).length,
    'Consulting': pipelineJobs.filter(j => ['Deloitte', 'Accenture', 'PwC', 'KPMG'].some(c => j.company.includes(c))).length
  };
  const segMax = Math.max(...Object.values(segments), 1);
  dist.innerHTML = Object.entries(segments).map(([k, v]) => `
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:70px; font-size:0.6rem; color:var(--muted); line-height:1;">${k}</div>
      <div style="flex:1; background:rgba(255,255,255,0.03); height:6px; border-radius:3px;">
        <div style="background:var(--blue); height:100%; width:${(v/segMax)*100}%; opacity:0.6;"></div>
      </div>
      <div style="font-size:0.7rem; font-weight:700;">${v}</div>
    </div>
  `).join('');

  // 3. Weekly Velocity (Real data from pipeline)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const weekData = [0, 0, 0, 0, 0, 0, 0];
  pipelineJobs.forEach(j => {
    if (j.dateApplied) {
      const applied = new Date(j.dateApplied);
      const diffDays = Math.floor((now - applied) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        const appliedDay = applied.getDay();
        const idx = appliedDay === 0 ? 6 : appliedDay - 1; // Convert to Mon=0..Sun=6
        weekData[idx]++;
      }
    }
  });
  const maxVel = Math.max(...weekData, 1);
  velocity.innerHTML = days.map((d, i) => `
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;">
      <div style="font-size:0.65rem; font-weight:700; color:var(--text2);">${weekData[i]}</div>
      <div style="width:100%; background:linear-gradient(to top, var(--blue), var(--cyan)); height:${Math.max((weekData[i]/maxVel)*120, 4)}px; border-radius:4px 4px 0 0; opacity:${weekData[i] > 0 ? '0.8' : '0.15'}; transition:height 0.6s ease;"></div>
      <div style="font-size:0.55rem; color:var(--muted);">${d}</div>
    </div>
  `).join('');
}

function renderDevelopment() {
  const container = document.getElementById('radar-development-view');
  if (!container) return;
  
  const phases = [
    { name: 'Phase 1: Foundation', status: 'completed', desc: 'Core agent logic and environment setup.' },
    { name: 'Phase 2: Job Fetching', status: 'completed', desc: 'LinkedIn & Naukri integration with deduplication.' },
    { name: 'Phase 3: AI Matching', status: 'in-progress', desc: 'Resume tailoring and skill gap analysis.' },
    { name: 'Phase 4: Auto-Apply', status: 'pending', desc: 'One-click application and tracking.' },
    { name: 'Phase 5: Smart Analytics', status: 'pending', desc: 'Market trend reporting and ROI tracking.' }
  ];

  const skillProficiency = [
    { skill: 'Apex & SOQL', value: 92 },
    { skill: 'LWC & Frontend', value: 85 },
    { skill: 'Integration & APIs', value: 78 },
    { skill: 'Data Cloud', value: 65 },
    { skill: 'Agentforce', value: 58 }
  ];

  const proficiencyEl = document.getElementById('skillProficiencyList');
  if (proficiencyEl) {
    proficiencyEl.innerHTML = skillProficiency.map(s => `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px;">
          <span>${s.skill}</span>
          <span style="color:var(--blue); font-weight:700;">${s.value}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.03); height:6px; border-radius:3px; overflow:hidden;">
          <div style="background:var(--blue); height:100%; width:${s.value}%; transition:width 1s ease;"></div>
        </div>
      </div>
    `).join('');
  }

  const readinessEl = document.getElementById('readyForDeploymentList');
  if (readinessEl) {
    readinessEl.innerHTML = phases.map(p => `
      <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:15px;">
        <div style="width:24px; height:24px; border-radius:50%; background:${p.status==='completed'?'var(--green)':p.status==='in-progress'?'var(--blue)':'rgba(255,255,255,0.05)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${p.status==='completed'?'OK':p.status==='in-progress'?'GO':'..'}
        </div>
        <div>
          <div style="font-size:0.8rem; font-weight:700; color:${p.status==='pending'?'var(--muted)':'var(--text)'}">${p.name}</div>
          <div style="font-size:0.65rem; color:var(--muted);">${p.desc}</div>
        </div>
      </div>
    `).join('');
  }
}

// Phase 3D: Interview Coach Logic
let selectedJobForCoach = null;
function openCoach(jobId) {
  selectedJobForCoach = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForCoach) {
    showToast('That card is no longer available in the pipeline.');
    return;
  }
  document.getElementById('coachModal').style.display = 'flex';
  const chat = document.getElementById('coachChat');
  chat.innerHTML = `<div style="background: var(--blue); color: white; padding: 12px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.85rem;">
    Hello Sunil! Ready for your interview with <strong>${selectedJobForCoach.company}</strong> for the <strong>${selectedJobForCoach.role}</strong> position? Let's start with: "Tell me about your experience with Data Cloud and how you've handled identity resolution."
  </div>`;
}

async function sendToCoach() {
  const input = document.getElementById('coachInput');
  const text = input.value.trim();
  if (!text) return;
  
  const chat = document.getElementById('coachChat');
  chat.innerHTML += `<div style="align-self: flex-end; background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 12px; border-radius: 12px 12px 0 12px; max-width: 85%; font-size: 0.85rem; color: var(--text);">${text}</div>`;
  input.value = '';
  chat.scrollTop = chat.scrollHeight;

  // Mock AI response for now
  setTimeout(() => {
    chat.innerHTML += `<div style="background: var(--blue); color: white; padding: 12px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.85rem;">
      Excellent point about CIM mapping. How would you handle a scenario where the source data has conflicting identity attributes but must be unified into a single individual?
    </div>`;
    chat.scrollTop = chat.scrollHeight;
  }, 1000);
}

// Phase 3F: Outreach Tracker
let selectedJobForOutreach = null;
function openOutreach(jobId) {
  selectedJobForOutreach = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForOutreach) {
    showToast('Open outreach from a valid card.');
    return;
  }
  document.getElementById('out-name').value = selectedJobForOutreach.outreach?.name || '';
  document.getElementById('out-status').value = selectedJobForOutreach.outreach?.status || 'sent';
  document.getElementById('outreachModal').style.display = 'flex';
}

function saveOutreach() {
  if (!selectedJobForOutreach) return;
  selectedJobForOutreach.outreach = {
    name: document.getElementById('out-name').value,
    status: document.getElementById('out-status').value,
    date: new Date().toISOString()
  };
  savePipeline();
  renderBoard();
  closeModal('outreachModal');
  showToast('Outreach recorded for ' + selectedJobForOutreach.company);
  logActivity(`Log outreach to <strong>${selectedJobForOutreach.outreach.name}</strong> (${selectedJobForOutreach.company})`, 'info');
}

// Phase 2H: Browser Notification System
async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("This browser does not support notifications");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    showToast("Reminders enabled.");
    scheduleReminders();
  }
}

function scheduleReminders() {
  setInterval(() => {
    pipelineJobs.forEach(j => {
      if (j.status === 'applied') {
        const status = getFollowUpStatus(j);
        if (status && (status.class === 'warn' || status.class === 'urgent')) {
          new Notification(`Action Needed: ${j.company}`, {
            body: `Follow-up due for ${j.role}.`,
            icon: 'https://cdn-icons-png.flaticon.com/512/561/561127.png'
          });
        }
      }
    });
  }, 3600000 * 4);
}

// Phase 3 Stubs
async function openAIAssistant(jobId) {
  const job = pipelineJobs.find(j => j.id === jobId);
  showToast(`Analyzing JD for ${job.company}...`);
  setTimeout(() => {
     alert(`AI Suggestions for ${job.company}:\n1. Highlight your ${job.score > 90 ? 'PD2 Certification' : 'LWC experience'}.\n2. Emphasize Mortgage domain expertise.\n3. Mention Agentforce Specialist role.`);
  }, 1000);
}

let selectedJobForEmail = null;
let currentEmailType = 'followup';

function openEmailModal(jobId) {
  selectedJobForEmail = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForEmail) {
    showToast('Open email generation from a valid card.');
    return;
  }
  document.getElementById('emailModal').style.display = 'flex';
  document.getElementById('emailBody').textContent = `Ready to compose for ${selectedJobForEmail.company}...`;
}

function selectEmailType(type, btn) {
  currentEmailType = type;
  document.querySelectorAll('.email-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function triggerEmailGeneration() {
  if (!selectedJobForEmail) return;
  const loading = document.getElementById('emailLoading');
  const body = document.getElementById('emailBody');
  const subject = document.getElementById('emailSubject');
  loading.style.display = 'flex';
  
  try {
    const prompt = `Write a professional ${currentEmailType} email for a Salesforce Developer role at ${selectedJobForEmail.company}. Role: ${selectedJobForEmail.role}. Candidate: Sunil Khatate (4 yrs exp, PD2).`;
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'gemma4:e4b', prompt, stream: false })
    });
    if (!response.ok) throw new Error('AI unreachable');
    const data = await response.json();
    body.textContent = data.response;
    logActivity(`Generated ${currentEmailType} email for <strong>${selectedJobForEmail.company}</strong>`, 'ai');
  } catch (e) {
    body.textContent = "AI unreachable. Ensure Ollama is running.";
  } finally {
    loading.style.display = 'none';
  }
}

function copyGeneratedEmail() {
  const text = document.getElementById('emailBody').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Copied.'));
}

function openPrepPanel(company) {
  currentPrepCompany = company || 'Cognizant';
  const prep = PREP_REGISTRY[company] || PREP_REGISTRY["Cognizant"]; 
  const content = document.getElementById('prepContent');
  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <h4 style="color:var(--blue); font-size:0.9rem; margin-bottom:10px;">Focus Areas</h4>
      <div style="font-size:0.8rem; color:var(--muted);">${prep.focus}</div>
    </div>
    <div style="margin-bottom:20px;">
      <h4 style="color:var(--green); font-size:0.9rem; margin-bottom:10px;">High-Frequency Questions</h4>
      <ul style="padding-left:20px; font-size:0.8rem; color:rgba(255,255,255,0.8); line-height:1.8;">
        ${prep.questions.map(q => `<li>${q}</li>`).join('')}
      </ul>
    </div>
  `;
  document.getElementById('prepPanel').style.display = 'flex';
}

function generateMoreQuestions() {
  const prep = PREP_REGISTRY[currentPrepCompany] || PREP_REGISTRY["Cognizant"];
  const content = document.getElementById('prepContent');
  if (!content) return;

  const existing = document.getElementById('prepExtraQuestions');
  if (existing) {
    existing.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Extra interview prompts are already loaded below.');
    return;
  }

  const extraQuestions = [
    `How would you tailor your strongest project story for ${currentPrepCompany}?`,
    `Which trade-off would you call out first if ${currentPrepCompany} asked for faster delivery and lower risk?`,
    `What architecture guardrails would you put in place before the first production release?`,
    `How would you explain your testing strategy to a delivery manager in one minute?`,
    `Which failure scenario would you proactively mention to show seniority in the interview?`,
    `How would you prioritize technical debt if the implementation timeline shrank by 30 percent?`,
    `What metrics would you use to prove your solution is healthy after go-live?`,
    `How would you adapt your mortgage domain examples for this company's business model?`,
    `Which of your certifications adds the most credibility here, and why?`,
    `What question should you ask the panel to expose the real complexity of the role?`
  ];

  content.innerHTML += `
    <div id="prepExtraQuestions" style="margin-top:20px; border-top:1px solid var(--border); padding-top:18px;">
      <h4 style="color:var(--amber); font-size:0.9rem; margin-bottom:10px;">Expansion Pack</h4>
      <ul style="padding-left:20px; font-size:0.8rem; color:rgba(255,255,255,0.82); line-height:1.8;">
        ${extraQuestions.map(question => `<li>${escapeHtml(question)}</li>`).join('')}
      </ul>
      <div style="margin-top:12px; font-size:0.72rem; color:var(--muted);">
        Focus prompts: ${escapeHtml((prep.tips || []).join(' | '))}
      </div>
    </div>
  `;
  showToast('Added 10 extra interview prompts for this company.');
}

function openAddJobModal() {
  document.getElementById('addJobModal').style.display = 'flex';
}

function submitCustomJob() {
  const company = document.getElementById('aj-company').value;
  const role = document.getElementById('aj-role').value;
  if (!company || !role) return showToast('Fill required fields');
  const newJob = {
    id: 'custom_' + Date.now(), company, role,
    loc: document.getElementById('aj-loc').value || 'Remote',
    sal: document.getElementById('aj-sal').value || 'â€”',
    prob: document.getElementById('aj-prob').value,
    score: document.getElementById('aj-score').value || 75,
    status: 'todo'
  };
  pipelineJobs.unshift(newJob);
  savePipeline(); renderBoard();
  closeModal('addJobModal');
  showToast('Job added.');
}

function updateAnalytics() {
  const submittedCount = pipelineJobs.filter(j => ['applied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
  const responseCount = pipelineJobs.filter(j => ['interview', 'offer', 'rejected'].includes(j.status)).length;
  const rate = submittedCount > 0 ? Math.round((responseCount / submittedCount) * 100) : 0;

  const interviewCount = pipelineJobs.filter(j => j.status === 'interview' || j.status === 'offer').length;
  const offerCount = pipelineJobs.filter(j => j.status === 'offer').length;
  const conv = interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : 0;

  const elRate = document.getElementById('met-rate');
  const elConv = document.getElementById('met-conversion');
  const elStreak = document.getElementById('met-streak');
  const elFollowup = document.getElementById('met-followup');
  const elWeekly = document.getElementById('met-weekly');
  const elGoalArc = document.getElementById('goal-arc');
  const elGoalPct = document.getElementById('goal-pct');

  if (elRate) elRate.textContent = rate + '%';
  if (elConv) elConv.textContent = conv + '%';
  if (elStreak) elStreak.textContent = computeApplyStreak() + 'd';
  if (elFollowup) elFollowup.textContent = pipelineJobs.filter(j => getFollowUpStatus(j)).length;

  const startOfWeek = new Date();
  startOfWeek.setHours(0,0,0,0);
  startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() || 7) + 1);
  const weeklyCount = pipelineJobs.filter(j => j.dateApplied && new Date(j.dateApplied) >= startOfWeek).length;
  
  if (elWeekly) elWeekly.textContent = `${weeklyCount}/5`;
  const pct = Math.min(Math.round((weeklyCount / 5) * 100), 100);
  if (elGoalArc) elGoalArc.style.strokeDasharray = `${pct} 100`;
  if (elGoalPct) elGoalPct.textContent = pct + '%';
}

function computeApplyStreak() {
  const appliedDates = [...new Set(
    pipelineJobs
      .filter(job => job.dateApplied)
      .map(job => {
        const d = new Date(job.dateApplied);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
      .filter(Boolean)
  )].sort((a, b) => b - a);

  if (!appliedDates.length) return 0;

  let streak = 1;
  let previous = new Date(appliedDates[0]);
  for (let index = 1; index < appliedDates.length; index += 1) {
    const next = new Date(appliedDates[index]);
    const gap = Math.round((previous - next) / 86400000);
    if (gap !== 1) break;
    streak += 1;
    previous = next;
  }
  return streak;
}

function checkOfferComparison() {
  const offers = pipelineJobs.filter(j => j.status === 'offer');
  const panel = document.getElementById('offer-comparison');
  if (!panel) return;

  if (offers.length >= 2) {
    panel.style.display = 'block';
    const container = document.getElementById('offer-matrix-container');
    if (container) {
      container.innerHTML = `
        <table style="width:100%; border-collapse:collapse; min-width:600px;">
          <thead><tr style="border-bottom:2px solid var(--border); color:var(--muted); font-size:0.7rem; text-transform:uppercase;"><th style="padding:12px; text-align:left;">Company</th><th style="padding:12px; text-align:left;">Salary</th><th style="padding:12px; text-align:left;">Fit</th></tr></thead>
          <tbody>${offers.map(o => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:12px; font-weight:700;">${o.company}</td><td style="padding:12px; color:var(--green);">${o.sal}</td><td style="padding:12px;">âš¡ ${o.score}%</td></tr>`).join('')}</tbody>
        </table>`;
    }
  } else {
    panel.style.display = 'none';
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = String(msg || '');
  t.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => t.style.transform = 'translateX(-50%) translateY(100px)', 3000);
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function exportLog() {
  if (!activityLog.length) {
    showToast('No activity log entries to export yet.');
    return;
  }

  const rows = [
    ['timestamp', 'type', 'text'],
    ...activityLog.map(entry => [
      entry.timestamp,
      entry.type,
      String(entry.text || '').replace(/<[^>]+>/g, '')
    ])
  ];

  const csv = rows
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `job-radar-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Activity log exported.');
}

function clearLog() {
  activityLog = [];
  localStorage.setItem('sfActivityLog', JSON.stringify(activityLog));
  renderLog();
  showToast('Activity log cleared.');
}

// Close sidebar when clicking a nav item or overlay on mobile (v1343)
document.addEventListener('click', function(e) {
  const isNavItem = e.target.closest('.nav-item');
  const isOverlay = e.target.id === 'sidebarOverlay';
  
  if ((isNavItem || isOverlay) && window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      toggleMobileSidebar();
    }
  }
});

// =============================================
// SAFETY STUBS: Functions that may be defined in inline HTML scripts
// These no-ops prevent ReferenceError if called before HTML scripts load
// =============================================
if (typeof renderStreakBadge !== 'function') { window.renderStreakBadge = function() {}; }
if (typeof renderBookmarkButtons !== 'function') { window.renderBookmarkButtons = function() {}; }
if (typeof renderRevisionAlerts !== 'function') { window.renderRevisionAlerts = function() {}; }
if (typeof showBookmarks !== 'function') { window.showBookmarks = function() {}; }
if (typeof updateSyncModalUI !== 'function') { window.updateSyncModalUI = function() {}; }
if (typeof updateSidebarProfileStatus !== 'function') { window.updateSidebarProfileStatus = function() {}; }

// =============================================
// INIT: Render streaks + bookmarks on load
// =============================================
window.addEventListener('DOMContentLoaded', function() {
  renderStreakBadge();
  setTimeout(renderBookmarkButtons, 500);
  renderRevisionAlerts(); // v1342

  // Unregister Service Worker to fix caching (v1405)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister();
        console.log('PWA: Service Worker Unregistered to force refresh.');
      }
    });
  }
});

// =============================================
// CLEANUP: Prevent memory leaks on page unload
// =============================================
window.addEventListener('beforeunload', function() {
  if (floatingTimerInterval) { clearInterval(floatingTimerInterval); floatingTimerInterval = null; }
  if (window._jobRadarInterval) { clearInterval(window._jobRadarInterval); window._jobRadarInterval = null; }
});

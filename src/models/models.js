import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: String,
  picture: String,
  lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);

const studySessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // Associated Google ID
  topic: { type: String, required: true },
  topicName: { type: String, required: true },
  duration: { type: Number, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  syncStatus: { type: String, default: 'cloud' }
}, { timestamps: true });

export const StudySession = mongoose.models.StudySession || mongoose.model('StudySession', studySessionSchema);

const jobRecordSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: String,
  company: String,
  location: String,
  salary: String,
  company_type: String,
  experience: String,
  probability: { type: String, enum: ['high', 'medium', 'stretch'], default: 'medium' },
  why_apply: String,
  date_added: { type: String, index: true },
  match_score: Number,
  match_level: String,
  matched_skills: [String],
  missing_skills: [String],
  resume_actions: [String],
  apply_link: String,
  job_hash: { type: String, index: true },
  status: { type: String, default: 'new', enum: ['new', 'applied', 'ignored'] },
  url: String
}, { timestamps: true });

jobRecordSchema.index({ userId: 1, job_hash: 1 }, { unique: true, sparse: true });

export const JobRecord = mongoose.models.JobRecord || mongoose.model('JobRecord', jobRecordSchema);

const taskStatusSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  index: { type: Number, required: true }, // Index of the task in the config
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index to ensure one status per user per task
taskStatusSchema.index({ userId: 1, index: 1 }, { unique: true });

export const TaskStatus = mongoose.models.TaskStatus || mongoose.model('TaskStatus', taskStatusSchema);

// ========================================
// USER PROFILE (Merged LinkedIn + Naukri)
// ========================================
const studyTopicSchema = new mongoose.Schema({
  topicId: String,             // Links to topicConfig in app.js timer system
  topic: String,               // "Data Cloud"
  priority: { type: String, enum: ['critical', 'high', 'medium'], default: 'medium' },
  reason: String,              // "Required for FDE certification"
  estimatedHours: Number,      // 10
  completed: { type: Boolean, default: false },
  // Spaced Repetition (v1342)
  confidence: { type: Number, default: 0 },
  nextReview: Date,
  interval: { type: Number, default: 0 },
  easeFactor: { type: Number, default: 2.5 }
}, { _id: false });

const userProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  // Merged profile data from LinkedIn + Naukri
  platforms: {
    linkedin: { synced: Boolean, lastSync: Date },
    naukri: { synced: Boolean, lastSync: Date }
  },
  // Core extracted data
  skills: [String],                              // ["Salesforce", "Apex", "LWC", ...]
  experienceYears: Number,                       // 4
  currentDesignation: String,                    // "Salesforce Developer"
  targetDesignation: String,                     // "Senior Salesforce Developer"
  currentRole: String,                           // "Salesforce Developer"
  targetRole: String,                            // "Senior Salesforce Developer"
  uiMode: { type: String, enum: ['classic', 'modern'], default: 'modern' },
  certifications: [String],                      // ["PD1", "Admin", "Data Cloud"]
  clouds: [String],                              // ["Sales Cloud", "Service Cloud"]
  tools: [String],                               // ["VS Code", "GitHub Actions", "Copado"]
  domains: [String],                             // ["Mortgage", "BFSI"]
  jobPreferences: mongoose.Schema.Types.Mixed,   // location, role type, salary, notice period
  profileImports: [{
    source: String,                              // "resume", "linkedin", "naukri", "manual"
    text: String,
    importedAt: { type: Date, default: Date.now }
  }],
  roadmapSnapshot: mongoose.Schema.Types.Mixed,  // Deterministic roadmap used for the current profile
  releaseFocus: mongoose.Schema.Types.Mixed,     // Release items filtered for current years/designation
  jobRadarStatuses: mongoose.Schema.Types.Mixed, // Per-user Kanban status overrides keyed by job hash/id
  codingPractice: {
    attempts: [mongoose.Schema.Types.Mixed],
    bestScores: mongoose.Schema.Types.Mixed,
    lastWorkspace: mongoose.Schema.Types.Mixed,
    completedChallengeIds: [String]
  },
  questionAttempts: [mongoose.Schema.Types.Mixed],
  mockInterviewSessions: [mongoose.Schema.Types.Mixed],
  releaseStudyActions: [mongoose.Schema.Types.Mixed],
  dailyStudyPlan: mongoose.Schema.Types.Mixed,
  userSettings: mongoose.Schema.Types.Mixed,
  notes: [mongoose.Schema.Types.Mixed],
  // AI-identified gaps
  missingSkills: [String],                       // Skills the AI found missing
  // Study plan
  studyPlan: String,                             // Full markdown study plan from Gemma 4
  studyPlanTopics: [studyTopicSchema],           // Structured topics linked to timer
  // Phase 1 Expansion (v1340)
  studyStreak: {
    current: { type: Number, default: 0 },
    best: { type: Number, default: 0 },
    lastDate: String
  },
  bookmarks: [{
    q: String,
    topic: String,
    date: { type: Date, default: Date.now }
  }],
  // Raw extraction log
  rawExtraction: {
    linkedinSkills: [String],
    naukriSkills: [String],
    linkedinCerts: [String],
    naukriCerts: [String]
  }
}, { timestamps: true });

export const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);

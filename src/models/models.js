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
  date_added: { type: String, index: true },
  match_score: Number,
  match_level: String,
  matched_skills: [String],
  missing_skills: [String],
  resume_actions: [String],
  apply_link: String,
  job_hash: { type: String, unique: true, index: true },
  status: { type: String, default: 'new', enum: ['new', 'applied', 'ignored'] },
  url: String
}, { timestamps: true });

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
  currentRole: String,                           // "Salesforce Developer"
  targetRole: String,                            // "Senior Salesforce Developer"
  certifications: [String],                      // ["PD1", "Admin", "Data Cloud"]
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

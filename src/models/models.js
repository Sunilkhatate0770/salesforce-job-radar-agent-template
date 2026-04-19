import mongoose from 'mongoose';

const studySessionSchema = new mongoose.Schema({
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
  title: String,
  company: String,
  location: String,
  date_added: { type: String, index: true },
  match_score: Number,
  url: String
}, { timestamps: true });

export const JobRecord = mongoose.models.JobRecord || mongoose.model('JobRecord', jobRecordSchema);

const taskStatusSchema = new mongoose.Schema({
  index: { type: Number, required: true, unique: true },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const TaskStatus = mongoose.models.TaskStatus || mongoose.model('TaskStatus', taskStatusSchema);

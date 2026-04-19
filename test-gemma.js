import { enrichJobsWithResumeMatch } from './src/resume/matchResume.js';
import dotenv from 'dotenv';

dotenv.config();

const mockJobs = [
  {
    title: "Senior Salesforce Developer",
    company: "Cloud Solutions Inc",
    location: "Remote",
    skills: "Apex, LWC, Integration, Data Cloud",
    description: "Looking for a Senior Salesforce Developer with experience in LWC and building complex integrations. Knowledge of Data Cloud is a plus."
  }
];

console.log("🚀 Testing Gemma 4 Integration...");
console.log("Model:", process.env.RESUME_AI_MODEL);

try {
  const result = await enrichJobsWithResumeMatch(mockJobs);
  console.log("\n✅ Success! Gemma 4 Analysis:");
  console.log("Match Score:", result[0].match_score);
  console.log("Match Level:", result[0].match_level);
  console.log("AI Resume Actions:", result[0].resume_actions);
} catch (error) {
  console.error("\n❌ Test Failed:", error.message);
}

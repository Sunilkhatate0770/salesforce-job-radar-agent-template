import "dotenv/config";
import { registerApplicationJobs } from "../db/applicationTracker.js";
import { enrichJobsWithResumeMatch } from "../resume/matchResume.js";

// Mock jobs based on Sunil's profile (Salesforce Developer, Entry Level, India)
const sunilJobs = [
  { id: "s1", title: "Salesforce Developer (Fresher)", company: "Accenture", location: "Pune, India", experience: "0-1 Years", skills: "Apex, LWC, Flows", apply_link: "https://www.accenture.com/in-en/careers/jobdetails?id=123" },
  { id: "s2", title: "Associate Salesforce Engineer", company: "Salesforce", location: "Hyderabad, India", experience: "Fresher", skills: "Apex, JS, LWC", apply_link: "https://salesforce.wd1.myworkdayjobs.com/External/job/Hyderabad/Associate-Engineer_JR123" },
  { id: "s3", title: "Junior Salesforce Developer", company: "Deloitte", location: "Bengaluru, India", experience: "0-2 Years", skills: "Sales Cloud, Apex", apply_link: "https://jobsindia.deloitte.com/job/Bengaluru-Junior-SFDC-Dev" },
  { id: "s4", title: "Salesforce Trainee", company: "Capgemini", location: "Mumbai, India", experience: "Fresher", skills: "Salesforce Admin, Apex", apply_link: "https://www.capgemini.com/in-en/jobs/salesforce-trainee" },
  { id: "s5", title: "SFDC Developer - Entry Level", company: "Wipro", location: "Chennai, India", experience: "0-1 Years", skills: "LWC, JavaScript, Apex", apply_link: "https://careers.wipro.com/jobs/sfdc-dev-india" },
  { id: "s6", title: "Salesforce Consultant (Junior)", company: "PwC India", location: "Gurugram, India", experience: "Fresher", skills: "Integration, Flows, Apex", apply_link: "https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers/job/Gurugram/Junior-SF-Consultant" },
  { id: "s7", title: "Salesforce Developer (Start-up)", company: "Zomato", location: "New Delhi, India", experience: "0-2 Years", skills: "LWC, Node.js, Apex", apply_link: "https://www.zomato.com/careers" },
  { id: "s8", title: "Associate Developer - Salesforce", company: "Cognizant", location: "Kolkata, India", experience: "Fresher", skills: "Apex, Visualforce", apply_link: "https://careers.cognizant.com/global/en/job/123" },
  { id: "s9", title: "Salesforce LWC Specialist (Entry)", company: "Infosys", location: "Mysuru, India", experience: "0-1 Years", skills: "LWC, CSS, Apex", apply_link: "https://www.infosys.com/careers/apply" },
  { id: "s10", title: "Junior Cloud Engineer (Salesforce)", company: "Oracle", location: "Bengaluru, India", experience: "Fresher", skills: "Java, Apex, SQL", apply_link: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/123" },
  { id: "s11", title: "Salesforce Developer", company: "TCS", location: "Ahmedabad, India", experience: "0-1 Years", skills: "Apex, Triggers, Flows", apply_link: "https://www.tcs.com/careers" },
  { id: "s12", title: "SFDC Trainee Engineer", company: "Persistent Systems", location: "Pune, India", experience: "Fresher", skills: "Salesforce, Java", apply_link: "https://www.persistent.com/careers" },
  { id: "s13", title: "Salesforce Support Engineer", company: "Amazon", location: "Bengaluru, India", experience: "0-2 Years", skills: "Salesforce, Python, Apex", apply_link: "https://www.amazon.jobs/en/jobs/123" },
  { id: "s14", title: "Salesforce Developer (Fresh Graduate)", company: "IBM India", location: "Mumbai, India", experience: "Fresher", skills: "Apex, LWC, Integration", apply_link: "https://www.ibm.com/in-en/employment" },
  { id: "s15", title: "Junior Salesforce Admin & Dev", company: "HCLTech", location: "Noida, India", experience: "0-1 Years", skills: "Admin, Apex, Flows", apply_link: "https://www.hcltech.com/careers" },
  { id: "s16", title: "Salesforce Developer (Product Team)", company: "Freshworks", location: "Chennai, India", experience: "0-2 Years", skills: "LWC, JavaScript", apply_link: "https://www.freshworks.com/company/careers" },
  { id: "s17", title: "Associate Salesforce Consultant", company: "KPMG India", location: "Pune, India", experience: "Fresher", skills: "Apex, Sales Cloud", apply_link: "https://home.kpmg/in/en/home/careers.html" },
  { id: "s18", title: "Salesforce Developer", company: "Mindtree", location: "Bengaluru, India", experience: "0-1 Years", skills: "Apex, Triggers", apply_link: "https://www.mindtree.com/careers" },
  { id: "s19", title: "SFDC Junior Dev", company: "LTI Mindtree", location: "Mumbai, India", experience: "Fresher", skills: "Apex, LWC", apply_link: "https://www.ltimindtree.com/careers" },
  { id: "s20", title: "Salesforce Developer Trainee", company: "Coforge", location: "Greater Noida, India", experience: "0-1 Years", skills: "Apex, Visualforce", apply_link: "https://www.coforge.com/careers" }
];

async function seedJobs() {
  console.log("🚀 Seeding Job Radar with Sunil's Personalized Jobs...");
  
  // Set resume env vars for the current process
  process.env.RESUME_MATCH_ENABLED = "true";
  process.env.RESUME_SKILLS = "Apex,LWC,Flows,Salesforce,JavaScript";
  process.env.RESUME_EXPERIENCE_YEARS = "0";
  process.env.RESUME_TARGET_ROLE = "Salesforce Developer";

  const enriched = await enrichJobsWithResumeMatch(sunilJobs);
  const result = await registerApplicationJobs(enriched, { event: "manual_seed" });
  
  console.log(`✅ Successfully seeded ${result.added} new jobs!`);
  console.log(`📊 Total jobs in database: ${result.total}`);
  console.log("\n--- Top Matches ---");
  enriched.slice(0, 5).forEach(j => {
    console.log(`[${j.match_score}%] ${j.title} @ ${j.company} (${j.apply_priority} Priority)`);
  });
}

seedJobs();

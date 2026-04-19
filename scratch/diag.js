import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const studyPath = path.join(CACHE_DIR, 'study-tracker.json');

if (!fs.existsSync(studyPath)) {
    console.log('Study tracker not found');
    process.exit(1);
}

const studyData = JSON.parse(fs.readFileSync(studyPath, 'utf8'));
console.log('Total sessions:', studyData.sessions.length);

const now = new Date();
const localToday = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

console.log('Local Today:', localToday);

const todaySessions = studyData.sessions.filter(s => s.date === localToday);
console.log('Sessions for local today:', todaySessions.length);

if (todaySessions.length > 0) {
    const breakdown = {};
    todaySessions.forEach(s => {
        const tid = s.topic || 'unknown';
        if (!breakdown[tid]) breakdown[tid] = { totalSeconds: 0, name: s.topicName };
        breakdown[tid].totalSeconds += s.duration;
    });
    console.log('Breakdown:', JSON.stringify(breakdown, null, 2));
} else {
    console.log('Sample session dates:', studyData.sessions.slice(-3).map(s => s.date));
}

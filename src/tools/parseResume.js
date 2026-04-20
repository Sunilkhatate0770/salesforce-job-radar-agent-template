import fs from 'fs';
import path from 'path';

export async function parsePdfResume() {
  const customPath = process.argv[2];
  const resumePath = customPath 
    ? path.resolve(process.cwd(), customPath)
    : path.resolve(process.cwd(), 'Sunil_Khatate_SFDC_2026.pdf');
  
  if (!fs.existsSync(resumePath)) {
    console.error(`❌ No resume found at: ${resumePath}`);
    console.error('Please ensure your PDF resume is in the directory or pass the filename as an argument (e.g. npm run resume:parse my-resume.pdf).');
    process.exit(1);
  }

  let PDFParser;
  try {
    PDFParser = (await import('pdf2json')).default;
  } catch (e) {
    console.error('❌ Required dependency "pdf2json" is missing.');
    console.error('Please run: npm install pdf2json');
    process.exit(1);
  }

  console.log(`📄 Reading ${path.basename(resumePath)} using pdf2json...`);
  
  const pdfParser = new PDFParser(null, 1); // 1 = extract text
  
  pdfParser.on("pdfParser_dataError", errData => {
    console.error('❌ PDF Parse Error:', errData.parserError);
  });
  
  pdfParser.on("pdfParser_dataReady", async pdfData => {
    const rawText = pdfParser.getRawTextContent();
    console.log('🤖 Sending resume to local Gemma 4 for deep analysis...');
    
    const prompt = `You are an expert technical recruiter analyzing a resume.
Extract the core technical skills and total years of professional experience from the following resume text.
Output EXACTLY valid JSON and nothing else, in this format:
{
  "years_experience": number,
  "skills": ["skill1", "skill2", "skill3"]
}

Resume Text:
${rawText}
`;

    try {
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          prompt: prompt,
          stream: false,
          format: 'json'
        })
      });

      if (!res.ok) throw new Error('Ollama not responding');
      
      const responseData = await res.json();
      const result = JSON.parse(responseData.response);
      
      console.log('✅ Gemma Analysis Complete!');
      console.log(`- Years Experience: ${result.years_experience}`);
      console.log(`- Detected Skills: ${result.skills.join(', ')}`);
      
      // Update .env
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      const envVars = {
        'RESUME_MATCH_ENABLED': 'true',
        'RESUME_EXPERIENCE_YEARS': result.years_experience,
        'RESUME_SKILLS': `"${result.skills.join(',')}"`
      };
      
      for (const [key, value] of Object.entries(envVars)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
      
      fs.writeFileSync(envPath, envContent.trim() + '\n');
      console.log('💾 Successfully updated .env with extracted resume data!');
      
    } catch (e) {
      console.error('❌ Failed to process with Gemma:', e.message);
    }
  });

  pdfParser.loadPDF(resumePath);
}

parsePdfResume();

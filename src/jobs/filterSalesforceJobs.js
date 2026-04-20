export function filterSalesforceJobs(jobs) {
  const roleMode = String(
    process.env.SALESFORCE_ROLE_MODE || "developer_strict"
  ).toLowerCase();

  const primaryKeywords = [
    "salesforce",
    "sfdc",
    "apex",
    "lwc",
    "visualforce",
    "force.com",
    "lightning web component",
    "field service lightning",
    "salesforce cpq",
    "service cloud",
    "sales cloud",
    "experience cloud",
    "marketing cloud"
  ];
  const titleKeywords = [
    "salesforce",
    "sfdc",
    "apex",
    "lwc",
    "lightning",
    "force.com",
    "cpq",
    "commerce cloud",
    "field service"
  ];

  const developerSignals = [
    "developer",
    "engineer",
    "programmer",
    "technical consultant",
    "integration consultant"
  ];
  const developerPhrases = [
    "salesforce developer",
    "sfdc developer",
    "apex developer",
    "lwc developer",
    "salesforce engineer",
    "salesforce platform developer",
    "lightning developer",
    "salesforce technical"
  ];
  const nonDeveloperRoleSignals = [
    "salesforce admin",
    "administrator",
    "business analyst",
    "functional consultant",
    "support",
    "tester",
    "qa"
  ];

  const results = [];

  for (const job of jobs) {
    const titleText = String(job.title || "").toLowerCase();
    const titleSkillsText = `${job.title || ""} ${job.skills || ""}`.toLowerCase();
    const text = (
      `${job.title} ${job.description || ""} ${job.skills || ""}`
    ).toLowerCase();

    const hasSalesforceSignal = primaryKeywords.some(k => text.includes(k));
    const hasSalesforceTitleSignal = titleKeywords.some(k =>
      titleText.includes(k)
    );
    const hasSalesforceTitleOrSkills = primaryKeywords.some(k =>
      titleSkillsText.includes(k)
    );
    const hasDeveloperPhrase =
      developerPhrases.some(k => titleText.includes(k)) ||
      developerPhrases.some(k => text.includes(k));
    const hasDeveloperSignal =
      developerSignals.some(k => titleText.includes(k)) ||
      developerSignals.some(k => text.includes(k));
    const isDeveloperRole =
      hasDeveloperPhrase ||
      (hasDeveloperSignal && hasSalesforceTitleOrSkills);
    const looksNonDeveloper =
      nonDeveloperRoleSignals.some(k => titleText.includes(k)) &&
      !hasDeveloperPhrase;

    if (!hasSalesforceSignal) continue;
    if (roleMode === "developer_strict" && (!isDeveloperRole || looksNonDeveloper)) {
      continue;
    }
    if (roleMode === "developer_strict" && !hasSalesforceTitleOrSkills) continue;

    const expText = job.experience || "";
    const rangeMatch = expText.match(/(\d+)\s*[-–]\s*(\d+)/);
    const singleMatch = expText.match(/(\d+)\s*\+?/);

    let min = null;
    let max = null;

    if (rangeMatch) {
      min = parseInt(rangeMatch[1], 10);
      max = parseInt(rangeMatch[2], 10);
    } else if (singleMatch) {
      min = parseInt(singleMatch[1], 10);
      max = min;
    }

    // 🎯 Relevance classification
    let relevance = "⚪ Other match";

    if (min !== null && max !== null) {
      if (min <= 4 && max >= 4) {
        relevance = "⭐ Strong match (≈4 yrs)";
      } else if (min <= 6 && max >= 5) {
        relevance = "🟡 Partial match (5–6 yrs)";
      } else if (max <= 3) {
        relevance = "🟢 Junior match (2–3 yrs)";
      } else if (min > 6) {
        relevance = "🟣 Senior match (7+ yrs)";
      }
    } else {
      // Fallback for when experience isn't explicitly mentioned in numbers (common on LinkedIn)
      if (hasDeveloperPhrase) {
        relevance = "⭐ Strong match (Role Aligned)";
      } else if (hasDeveloperSignal && hasSalesforceTitleOrSkills) {
        relevance = "🟡 Partial match (Skill Aligned)";
      }
    }

    results.push({
      ...job,
      relevance
    });
  }

  return results;
}

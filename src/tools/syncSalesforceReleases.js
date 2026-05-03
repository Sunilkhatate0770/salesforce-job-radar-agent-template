import "dotenv/config";
import { syncReleaseCenter } from "../releases/releaseCenter.js";

syncReleaseCenter()
  .then(payload => {
    const active = payload.activeRelease?.releaseName || "Current Release";
    console.log(
      `Salesforce release center synced: ${active} | items=${payload.items?.length || 0} | generatedAt=${payload.generatedAt}`
    );
    setImmediate(() => process.exit(0));
  })
  .catch(error => {
    console.error("Salesforce release center sync failed:", error.message);
    process.exitCode = 1;
  });

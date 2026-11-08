import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// This application uses dynamic, authenticated database-backed pages.
// No R2 incremental-cache bucket is required for this initial deployment.
export default defineCloudflareConfig({});

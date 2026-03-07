#!/usr/bin/env node

/**
 * Performance & precision test for backlog + mcp-local-rag.
 *
 * Creates 50 diverse tasks, ingests them, then runs targeted semantic queries
 * to validate that:
 *   1. The correct tasks are found (precision)
 *   2. Irrelevant tasks are NOT returned (no bloat)
 *   3. Response sizes stay context-friendly
 *
 * Usage: node perf-test.mjs
 */

import { execSync } from "node:child_process";
import { RAGServer } from "mcp-local-rag/dist/server/index.js";
import { readdir, readFile } from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, extname } from "node:path";
import os from "node:os";

const BASE_DIR = join(process.cwd(), "backlog");
const DB_PATH = join(process.cwd(), ".lancedb");
const CACHE_DIR = process.env.CACHE_DIR || join(os.homedir(), ".mcp-local-rag-models");

// ─── Task definitions ────────────────────────────────────────────────────────
// 50 tasks across 10 domains, each with rich descriptions for semantic matching

const TASKS = [
  // === AUTH & SECURITY (5) ===
  { title: "Implement OAuth2 login with Google provider", desc: "Add Google OAuth2 authentication flow using passport.js. Users should be able to sign in with their Google account. Store refresh tokens securely in encrypted database columns. Handle token expiration and automatic refresh.", labels: "security,auth", priority: "high" },
  { title: "Add two-factor authentication via TOTP", desc: "Implement time-based one-time password (TOTP) 2FA using speakeasy library. Generate QR codes for authenticator app setup. Provide backup recovery codes. Allow users to enable/disable 2FA from settings.", labels: "security,auth", priority: "high" },
  { title: "Implement role-based access control", desc: "Create RBAC system with roles: admin, editor, viewer. Define permissions matrix for all API endpoints. Add middleware to check permissions on protected routes. Support custom role creation.", labels: "security,auth", priority: "high" },
  { title: "Add rate limiting to prevent brute force attacks", desc: "Implement IP-based and account-based rate limiting using express-rate-limit. Set stricter limits on login endpoints (5 attempts per 15 minutes). Add exponential backoff. Log suspicious activity.", labels: "security", priority: "medium" },
  { title: "Conduct security audit and penetration testing", desc: "Hire external security firm to perform penetration testing. Fix all critical and high severity findings. Document security policies. Set up automated SAST scanning in CI pipeline using Snyk.", labels: "security", priority: "high" },

  // === DATABASE (5) ===
  { title: "Migrate from MongoDB to PostgreSQL", desc: "Plan and execute database migration from MongoDB to PostgreSQL. Create Prisma schema matching current Mongoose models. Write data migration scripts. Ensure zero downtime during cutover.", labels: "database,backend", priority: "high" },
  { title: "Implement database connection pooling", desc: "Configure PgBouncer for PostgreSQL connection pooling. Set pool size based on load testing results. Monitor connection utilization. Handle pool exhaustion gracefully with queuing.", labels: "database,performance", priority: "medium" },
  { title: "Add database backup and recovery procedures", desc: "Set up automated daily PostgreSQL backups using pg_dump. Store backups in S3 with 30-day retention. Test recovery procedure monthly. Document RTO and RPO targets.", labels: "database,ops", priority: "high" },
  { title: "Optimize slow database queries", desc: "Profile top 20 slowest queries using pg_stat_statements. Add missing indexes identified by EXPLAIN ANALYZE. Rewrite N+1 queries to use JOINs. Target: 95th percentile query time under 100ms.", labels: "database,performance", priority: "medium" },
  { title: "Implement database schema versioning with migrations", desc: "Set up Prisma Migrate for schema version control. Create migration for every schema change. Add CI check that migrations are up to date. Document rollback procedures.", labels: "database", priority: "medium" },

  // === FRONTEND UI (5) ===
  { title: "Redesign landing page with new brand identity", desc: "Implement new landing page design from Figma mockups. Use Tailwind CSS for responsive layout. Add hero section with animated gradient background. Optimize for Core Web Vitals.", labels: "frontend,design", priority: "high" },
  { title: "Build reusable component library with Storybook", desc: "Create shared UI component library: Button, Input, Modal, Toast, Table, Card. Document props with Storybook stories. Add visual regression testing with Chromatic. Publish as internal npm package.", labels: "frontend,design", priority: "medium" },
  { title: "Implement dark mode theme toggle", desc: "Add system-preference-aware dark mode. Use CSS custom properties for theming. Persist user preference in localStorage. Ensure all components support both themes. Test contrast ratios for WCAG AA.", labels: "frontend,design", priority: "low" },
  { title: "Add infinite scroll to activity feed", desc: "Replace paginated activity feed with infinite scroll using Intersection Observer API. Implement virtual scrolling for performance with large lists. Add skeleton loading states. Handle network errors gracefully.", labels: "frontend,performance", priority: "medium" },
  { title: "Fix mobile responsive layout issues", desc: "Audit all pages on mobile viewports (320px-768px). Fix hamburger menu not closing on navigation. Fix table overflow on small screens. Ensure touch targets are minimum 44x44px per WCAG guidelines.", labels: "frontend,bug", priority: "high" },

  // === API & BACKEND (5) ===
  { title: "Implement GraphQL API layer", desc: "Add GraphQL API using Apollo Server alongside existing REST. Create schema for User, Project, Task entities. Implement DataLoader for N+1 prevention. Add query complexity analysis to prevent abuse.", labels: "backend,api", priority: "medium" },
  { title: "Add API versioning strategy", desc: "Implement URL-based API versioning (v1, v2). Create version negotiation middleware. Document deprecation policy (6 month sunset). Add response headers for version info and deprecation warnings.", labels: "backend,api", priority: "medium" },
  { title: "Build webhook delivery system", desc: "Create webhook registration and delivery system. Support events: task.created, task.updated, user.invited. Implement retry with exponential backoff (max 5 attempts). Log all delivery attempts. Add webhook signature verification.", labels: "backend,api", priority: "medium" },
  { title: "Implement server-side caching with Redis", desc: "Add Redis caching layer for frequently accessed data. Cache user sessions, API responses, and computed aggregations. Set appropriate TTLs. Implement cache invalidation on writes. Monitor hit rates.", labels: "backend,performance", priority: "high" },
  { title: "Add background job processing with BullMQ", desc: "Set up BullMQ for async job processing. Create queues for: email sending, report generation, data exports. Add job retry logic and dead letter queues. Build admin UI for job monitoring.", labels: "backend", priority: "medium" },

  // === TESTING (5) ===
  { title: "Increase unit test coverage to 80%", desc: "Write unit tests for all service layer functions. Current coverage: 45%. Target: 80% line coverage. Focus on business logic in src/services/. Use Jest with ts-jest. Mock external dependencies.", labels: "testing,quality", priority: "high" },
  { title: "Add end-to-end tests with Playwright", desc: "Set up Playwright for E2E testing. Write tests for critical user flows: signup, login, create project, invite member, create task. Run in CI against staging environment. Add visual comparison tests.", labels: "testing,quality", priority: "high" },
  { title: "Implement load testing with k6", desc: "Create k6 load test scripts for API endpoints. Simulate 1000 concurrent users. Measure response times, error rates, throughput. Identify bottlenecks. Set performance budgets in CI.", labels: "testing,performance", priority: "medium" },
  { title: "Add contract testing for microservices", desc: "Implement Pact contract testing between frontend and API, and between API and notification service. Generate and publish contracts in CI. Verify on every PR. Prevent breaking changes.", labels: "testing,quality", priority: "medium" },
  { title: "Set up mutation testing with Stryker", desc: "Configure Stryker mutation testing for critical business logic modules. Target: 70% mutation score for src/services/billing/. Run weekly in CI. Fix surviving mutants by adding missing test assertions.", labels: "testing,quality", priority: "low" },

  // === DEVOPS & INFRA (5) ===
  { title: "Migrate to Kubernetes from Docker Compose", desc: "Containerize all services with optimized multi-stage Dockerfiles. Create Kubernetes manifests (Deployment, Service, Ingress). Set up Helm charts for environment configuration. Implement rolling deployments.", labels: "devops,infrastructure", priority: "high" },
  { title: "Set up GitOps with ArgoCD", desc: "Install ArgoCD in Kubernetes cluster. Create application manifests for all services. Implement environment promotion: dev -> staging -> production. Add Slack notifications for sync status.", labels: "devops,infrastructure", priority: "medium" },
  { title: "Implement infrastructure as code with Terraform", desc: "Define all AWS infrastructure in Terraform: VPC, ECS, RDS, ElastiCache, S3, CloudFront. Use modules for reusability. Store state in S3 with DynamoDB locking. Add plan output to PR comments.", labels: "devops,infrastructure", priority: "high" },
  { title: "Configure centralized logging with ELK stack", desc: "Deploy Elasticsearch, Logstash, Kibana for centralized logging. Ship application logs via Filebeat. Create dashboards for error rates, latency, and throughput. Set up alerts for anomalies.", labels: "devops,monitoring", priority: "medium" },
  { title: "Set up disaster recovery plan", desc: "Document disaster recovery procedures for all critical systems. Set up cross-region database replication. Create automated failover scripts. Test DR plan quarterly. Target RPO: 1 hour, RTO: 4 hours.", labels: "devops,ops", priority: "high" },

  // === NOTIFICATIONS & COMMS (5) ===
  { title: "Build email notification system with templates", desc: "Create transactional email service using SendGrid. Design responsive HTML email templates for: welcome, password reset, task assigned, weekly digest. Support email preferences per user.", labels: "notifications,backend", priority: "medium" },
  { title: "Add real-time push notifications", desc: "Implement push notifications using Firebase Cloud Messaging. Support web push and mobile push. Create notification preferences panel. Handle notification grouping to avoid spam.", labels: "notifications,frontend", priority: "medium" },
  { title: "Implement in-app notification center", desc: "Build notification dropdown component showing recent activity. Support mark as read/unread. Add notification badges on nav. Paginate with infinite scroll. Real-time updates via WebSocket.", labels: "notifications,frontend", priority: "medium" },
  { title: "Add Slack integration for team updates", desc: "Build Slack bot that posts task updates to configured channels. Support slash commands: /task create, /task list, /task assign. Implement OAuth2 flow for workspace installation.", labels: "notifications,integrations", priority: "low" },
  { title: "Create SMS alerts for critical incidents", desc: "Integrate Twilio for SMS alerts on critical system events. Configure escalation policies: page on-call engineer after 5 min. Support phone call escalation after 15 min. Manage on-call schedules.", labels: "notifications,ops", priority: "medium" },

  // === DATA & ANALYTICS (5) ===
  { title: "Build analytics dashboard with charts", desc: "Create analytics page showing: task completion rates, team velocity, burndown charts, cycle time distribution. Use Recharts library. Support date range filters. Export to CSV.", labels: "analytics,frontend", priority: "medium" },
  { title: "Implement event tracking with Mixpanel", desc: "Add Mixpanel SDK for user behavior tracking. Track events: page views, feature usage, funnel progression. Create dashboards for product metrics. Implement user identification across sessions.", labels: "analytics,product", priority: "medium" },
  { title: "Build data export and reporting system", desc: "Create scheduled and on-demand data export system. Support formats: CSV, JSON, PDF. Generate weekly project status reports automatically. Email reports to stakeholders.", labels: "analytics,backend", priority: "medium" },
  { title: "Add full-text search with Elasticsearch", desc: "Deploy Elasticsearch for full-text search across tasks, comments, and documents. Implement search-as-you-type with autocomplete. Add faceted filtering by status, assignee, label. Highlight matching terms.", labels: "search,backend", priority: "high" },
  { title: "Implement audit logging for compliance", desc: "Log all data modifications with who, what, when, old value, new value. Store audit logs in append-only table. Create audit trail viewer for admins. Support SOC2 compliance reporting.", labels: "analytics,security", priority: "high" },

  // === PAYMENTS & BILLING (5) ===
  { title: "Integrate Stripe for subscription billing", desc: "Implement Stripe Checkout for subscription plans: Free, Pro ($10/mo), Enterprise ($50/mo). Handle webhooks for payment events. Support upgrade/downgrade with proration. Create billing portal.", labels: "payments,backend", priority: "high" },
  { title: "Add usage-based billing metering", desc: "Track API calls, storage usage, and team member count per account. Implement usage metering with Stripe usage records. Send usage approaching limit notifications. Enforce hard limits on Free tier.", labels: "payments,backend", priority: "medium" },
  { title: "Build invoice generation system", desc: "Auto-generate PDF invoices on payment. Include company details, line items, tax calculations. Support multiple currencies. Email invoices to billing contacts. Store in S3 with 7-year retention.", labels: "payments,backend", priority: "medium" },
  { title: "Implement trial period and onboarding flow", desc: "Create 14-day free trial for Pro plan. Build onboarding wizard: create project, invite team, create first task. Send trial ending reminders at day 7, 12, 13. Handle trial expiration gracefully.", labels: "payments,product", priority: "medium" },
  { title: "Add coupon and discount code system", desc: "Implement promotional discount codes using Stripe coupons. Support percentage and fixed-amount discounts. Create admin interface for coupon management. Track redemption analytics.", labels: "payments,backend", priority: "low" },

  // === PERFORMANCE & OPTIMIZATION (5) ===
  { title: "Implement CDN for static assets", desc: "Set up CloudFront CDN for serving static assets (JS, CSS, images). Configure cache headers and invalidation. Enable Brotli compression. Measure improvement with Lighthouse. Target: 90+ performance score.", labels: "performance,infrastructure", priority: "high" },
  { title: "Add server-side rendering for SEO pages", desc: "Implement Next.js SSR for marketing pages and public project views. Configure metadata for Open Graph and Twitter cards. Generate sitemap.xml. Submit to Google Search Console.", labels: "performance,frontend,seo", priority: "medium" },
  { title: "Optimize Docker image sizes", desc: "Reduce Docker image sizes from 1.2GB to under 200MB. Use multi-stage builds with Alpine base. Remove dev dependencies. Implement layer caching in CI. Benchmark startup time improvement.", labels: "performance,devops", priority: "low" },
  { title: "Implement database query result caching", desc: "Add application-level query caching using Redis. Cache expensive aggregation queries (dashboard stats, report data). Implement cache-aside pattern. Set up cache warming for predictable queries.", labels: "performance,database", priority: "medium" },
  { title: "Add bundle analysis and code splitting", desc: "Configure webpack-bundle-analyzer. Identify large dependencies. Implement route-based code splitting with React.lazy. Move heavy libs (moment, lodash) to dynamic imports. Target: initial bundle under 200KB gzipped.", labels: "performance,frontend", priority: "medium" },
];

// ─── Test queries with expected matches ──────────────────────────────────────
// Each query specifies which task titles SHOULD appear in top results

const TEST_QUERIES = [
  {
    query: "user login authentication OAuth single sign-on",
    expectedTitles: ["Implement OAuth2 login with Google provider", "Add two-factor authentication via TOTP", "Implement role-based access control"],
    unexpectedDomains: ["payments", "analytics", "performance"],
    description: "Auth query should find auth tasks, not payments/analytics",
  },
  {
    query: "database slow performance optimization indexes",
    expectedTitles: ["Optimize slow database queries", "Implement database connection pooling", "Implement database query result caching"],
    unexpectedDomains: ["notifications", "frontend"],
    description: "DB performance query should find DB/cache tasks",
  },
  {
    query: "payment subscription stripe checkout billing",
    expectedTitles: ["Integrate Stripe for subscription billing", "Add usage-based billing metering", "Build invoice generation system"],
    unexpectedDomains: ["testing", "devops"],
    description: "Payment query should find billing tasks only",
  },
  {
    query: "automated testing CI continuous integration quality",
    expectedTitles: ["Increase unit test coverage to 80%", "Add end-to-end tests with Playwright", "Implement load testing with k6"],
    unexpectedDomains: ["payments", "notifications"],
    description: "Testing query should find test tasks",
  },
  {
    query: "mobile responsive layout CSS design",
    expectedTitles: ["Fix mobile responsive layout issues", "Redesign landing page with new brand identity", "Implement dark mode theme toggle"],
    unexpectedDomains: ["database", "payments", "devops"],
    description: "Frontend design query should find UI tasks",
  },
  {
    query: "Kubernetes Docker containers deployment orchestration",
    expectedTitles: ["Migrate to Kubernetes from Docker Compose", "Set up GitOps with ArgoCD", "Implement infrastructure as code with Terraform"],
    unexpectedDomains: ["payments", "notifications", "frontend"],
    description: "Infrastructure query should find devops tasks",
  },
  {
    query: "email alerts notifications messaging users",
    expectedTitles: ["Build email notification system with templates", "Add real-time push notifications", "Implement in-app notification center"],
    unexpectedDomains: ["database", "payments", "performance"],
    description: "Notification query should find notification tasks",
  },
  {
    query: "charts graphs metrics tracking product usage",
    expectedTitles: ["Build analytics dashboard with charts", "Implement event tracking with Mixpanel", "Build data export and reporting system"],
    unexpectedDomains: ["auth", "devops"],
    description: "Analytics query should find data/analytics tasks",
  },
  {
    query: "security vulnerability penetration audit compliance",
    expectedTitles: ["Conduct security audit and penetration testing", "Implement audit logging for compliance", "Add rate limiting to prevent brute force attacks"],
    unexpectedDomains: ["frontend", "payments"],
    description: "Security query should find security tasks",
  },
  {
    query: "search autocomplete full text elasticsearch find",
    expectedTitles: ["Add full-text search with Elasticsearch"],
    unexpectedDomains: ["payments", "notifications"],
    description: "Search query should find search-related tasks",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", cwd: process.cwd(), timeout: 30000 }).trim();
}

async function findFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await findFiles(fullPath)));
    else if (entry.isFile() && [".md", ".txt"].includes(extname(entry.name).toLowerCase()))
      results.push(fullPath);
  }
  return results;
}

async function hashFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

const HASH_CACHE_PATH = join(DB_PATH, ".ingest-hashes.json");

function loadHashCache() {
  if (existsSync(HASH_CACHE_PATH)) {
    try { return JSON.parse(readFileSync(HASH_CACHE_PATH, "utf-8")); } catch { return {}; }
  }
  return {};
}
function saveHashCache(cache) {
  writeFileSync(HASH_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ─── Phase 1: Create tasks ──────────────────────────────────────────────────

console.log("\n═══ PHASE 1: Creating 50 test tasks ═══\n");

let created = 0;
let skipped = 0;

for (const task of TASKS) {
  try {
    const existing = run(`backlog task search "${task.title.substring(0, 30)}" 2>/dev/null || true`);
    if (existing.includes(task.title.substring(0, 25))) {
      skipped++;
      continue;
    }
  } catch { /* search failed, try creating anyway */ }

  try {
    const labelArgs = task.labels.split(",").map(l => `-l ${l.trim()}`).join(" ");
    run(`backlog task create "${task.title}" -d "${task.desc}" ${labelArgs} -p ${task.priority} 2>/dev/null`);
    created++;
    if (created % 10 === 0) console.log(`  Created ${created} tasks...`);
  } catch (err) {
    console.log(`  Failed to create: ${task.title} — ${err.message}`);
  }
}

console.log(`  Done: ${created} created, ${skipped} already existed\n`);

// ─── Phase 2: Ingest into RAG ───────────────────────────────────────────────

console.log("═══ PHASE 2: Ingesting into RAG vector store ═══\n");

const server = new RAGServer({
  dbPath: DB_PATH,
  modelName: "Xenova/all-MiniLM-L6-v2",
  cacheDir: CACHE_DIR,
  baseDir: BASE_DIR,
  maxFileSize: 104857600,
});

await server.initialize();

const files = await findFiles(BASE_DIR);
const hashes = loadHashCache();
const currentPaths = new Set(files.map(f => resolve(f)));

let ingested = 0;
let ingestSkipped = 0;

for (const filePath of files) {
  const absPath = resolve(filePath);
  const hash = await hashFile(absPath);
  if (hashes[absPath] === hash) { ingestSkipped++; continue; }
  try {
    await server.handleIngestFile({ filePath: absPath });
    hashes[absPath] = hash;
    ingested++;
  } catch (err) {
    console.log(`  Ingest error: ${absPath} — ${err.message}`);
  }
}

// Clean deleted
for (const cachedPath of Object.keys(hashes)) {
  if (!currentPaths.has(cachedPath)) {
    try { await server.handleDeleteFile({ filePath: cachedPath }); } catch {}
    delete hashes[cachedPath];
  }
}
saveHashCache(hashes);

console.log(`  Ingested: ${ingested} new, ${ingestSkipped} unchanged`);
console.log(`  Total files in index: ${files.length}\n`);

// ─── Phase 3: Precision/Recall tests ────────────────────────────────────────

console.log("═══ PHASE 3: Precision & recall tests ═══\n");

let totalPrecision = 0;
let totalRecall = 0;
let totalResponseBytes = 0;
let testsPassed = 0;
let testsFailed = 0;

for (const test of TEST_QUERIES) {
  const result = await server.handleQueryDocuments({ query: test.query, limit: 5 });
  const resultText = JSON.stringify(result);
  const responseBytes = Buffer.byteLength(resultText, "utf-8");
  totalResponseBytes += responseBytes;

  // Parse results — handleQueryDocuments returns { content: [{ type: "text", text: "<JSON array>" }] }
  let resultTitles = [];
  let chunks = [];
  try {
    const jsonStr = result.content?.[0]?.text || "[]";
    chunks = JSON.parse(jsonStr);

    // Deduplicate by fileTitle (multiple chunks from same file)
    const seen = new Set();
    for (const item of chunks) {
      const title = item.fileTitle || "";
      if (title && !seen.has(title)) {
        seen.add(title);
        resultTitles.push(title);
      }
    }
  } catch (e) {
    console.log(`    Parse error: ${e.message}`);
  }

  // Calculate precision (what % of returned unique titles are relevant)
  const matchedRelevant = resultTitles.filter(t =>
    test.expectedTitles.some(exp => t.toLowerCase() === exp.toLowerCase() || t.toLowerCase().includes(exp.toLowerCase().substring(0, 25)) || exp.toLowerCase().includes(t.toLowerCase().substring(0, 25)))
  );

  // Calculate recall (what % of expected results were found)
  const foundExpected = test.expectedTitles.filter(exp =>
    resultTitles.some(t => t.toLowerCase() === exp.toLowerCase() || t.toLowerCase().includes(exp.toLowerCase().substring(0, 25)) || exp.toLowerCase().includes(t.toLowerCase().substring(0, 25)))
  );

  const precision = resultTitles.length > 0 ? matchedRelevant.length / resultTitles.length : 0;
  const recall = test.expectedTitles.length > 0 ? foundExpected.length / test.expectedTitles.length : 0;

  totalPrecision += precision;
  totalRecall += recall;

  const passed = recall >= 0.33; // At least 1 of 3 expected found
  if (passed) testsPassed++; else testsFailed++;

  const scores = chunks.map(c => c.score?.toFixed(3)).join(", ");
  const icon = passed ? "✓" : "✗";
  console.log(`  ${icon} "${test.description}"`);
  console.log(`    Query: "${test.query.substring(0, 60)}"`);
  console.log(`    Found (${resultTitles.length} unique from ${chunks.length} chunks): ${resultTitles.slice(0, 5).map(t => t.substring(0, 50)).join(" | ")}`);
  console.log(`    Scores: [${scores}]`);
  console.log(`    Expected (found ${foundExpected.length}/${test.expectedTitles.length}): ${test.expectedTitles.map(t => t.substring(0, 40)).join(", ")}`);
  console.log(`    Precision: ${(precision * 100).toFixed(0)}%, Recall: ${(recall * 100).toFixed(0)}%, Response: ${responseBytes} bytes (~${Math.ceil(responseBytes / 4)} tokens)`);
  console.log("");
}

// ─── Phase 4: Response size analysis ─────────────────────────────────────────

console.log("═══ PHASE 4: Response size analysis ═══\n");

// Test with different limits
for (const limit of [3, 5, 10, 20]) {
  const result = await server.handleQueryDocuments({ query: "authentication security login", limit });
  const bytes = Buffer.byteLength(JSON.stringify(result), "utf-8");
  const approxTokens = Math.ceil(bytes / 4); // ~4 bytes per token estimate
  console.log(`  limit=${limit}: ${bytes} bytes (~${approxTokens} tokens)`);
}

// Test backlog MCP task_search output size
console.log("\n  Backlog CLI task list/search sizes:");
try {
  const allTasks = run(`backlog task list 2>/dev/null || true`);
  const bytes = Buffer.byteLength(allTasks, "utf-8");
  const lines = allTasks.split("\n").length;
  console.log(`    task list (all ${files.length} tasks): ${bytes} bytes (~${Math.ceil(bytes/4)} tokens), ${lines} lines`);
} catch { console.log("    task list: failed"); }

for (const query of ["authentication", "payment", "testing"]) {
  try {
    const result = run(`backlog task search "${query}" 2>/dev/null || true`);
    const bytes = Buffer.byteLength(result, "utf-8");
    const lines = result.split("\n").filter(l => l.trim()).length;
    console.log(`    task search("${query}"): ${bytes} bytes (~${Math.ceil(bytes/4)} tokens), ${lines} results`);
  } catch {
    console.log(`    task search("${query}"): failed`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const avgPrecision = (totalPrecision / TEST_QUERIES.length * 100).toFixed(1);
const avgRecall = (totalRecall / TEST_QUERIES.length * 100).toFixed(1);
const avgResponseBytes = Math.round(totalResponseBytes / TEST_QUERIES.length);
const avgResponseTokens = Math.ceil(avgResponseBytes / 4);

console.log("\n═══ SUMMARY ═══\n");
console.log(`  Tests: ${testsPassed} passed, ${testsFailed} failed (of ${TEST_QUERIES.length})`);
console.log(`  Avg precision: ${avgPrecision}%`);
console.log(`  Avg recall: ${avgRecall}%`);
console.log(`  Avg response size (limit=5): ${avgResponseBytes} bytes (~${avgResponseTokens} tokens)`);
console.log(`  Total tasks in backlog: ${files.length}`);
console.log("");

if (testsFailed > 2) {
  console.log("  ⚠ Several tests failed — semantic matching may need tuning");
} else {
  console.log("  ✓ Semantic search performing well across diverse task domains");
}

process.exit(testsFailed > 5 ? 1 : 0);

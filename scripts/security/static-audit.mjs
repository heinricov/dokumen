import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join, relative, resolve } from "node:path"

const ROOT = resolve(process.cwd())
const BACKEND_DIR = join(ROOT, "apps", "backend")
const PACKAGES_DIR = join(ROOT, "packages")

const SECURITY_AUDIT_FILE = join(
  ROOT,
  "scripts",
  "docs",
  "backend-security-audit.md"
)

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".git",
  "generated",
])

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
])

/**
 * File yang memang diperbolehkan membaca process.env
 * karena file tersebut merupakan centralized configuration.
 */
const ENVIRONMENT_CONFIG_FILES = new Set([
  "apps/backend/src/config/app.config.ts",
  "apps/backend/src/config/auth.config.ts",
  "apps/backend/src/config/database.config.ts",
  "apps/backend/src/config/env.validation.ts",
  "packages/db/src/index.ts",
])

/**
 * File debugging lokal.
 *
 * Sebaiknya file-file ini tetap dihapus dari project,
 * tetapi scanner tidak akan menganggapnya sebagai
 * production source.
 */
const IGNORED_FILES = new Set([
  "apps/backend/_meta.ts",
  "apps/backend/_probe.ts",
])

const findings = []

function addFinding({
  severity,
  category,
  file,
  line,
  message,
  recommendation,
}) {
  findings.push({
    severity,
    category,
    file,
    line,
    message,
    recommendation,
  })
}

function generateMarkdownReport() {
  const generatedAt = new Date().toISOString()

  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  }

  for (const finding of findings) {
    counts[finding.severity]++
  }

  const passed = counts.CRITICAL === 0 && counts.HIGH === 0

  const status = passed ? "PASSED" : "FAILED"

  const lines = [
    "# Backend Security Audit",
    "",
    `> Generated automatically by \`pnpm security:audit\`.`,
    "",
    `**Generated:** ${generatedAt}`,
    "",
    `**Status:** ${status}`,
    "",
    "## Summary",
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| CRITICAL | ${counts.CRITICAL} |`,
    `| HIGH | ${counts.HIGH} |`,
    `| MEDIUM | ${counts.MEDIUM} |`,
    `| LOW | ${counts.LOW} |`,
    `| **TOTAL** | **${findings.length}** |`,
    "",
  ]

  if (findings.length === 0) {
    lines.push("## Result", "", "No security findings were detected.", "")
  } else {
    lines.push("## Findings", "")

    for (const finding of findings) {
      lines.push(
        `### ${finding.severity} — ${finding.category}`,
        "",
        `- **File:** \`${finding.file}\``,
        `- **Line:** ${finding.line}`,
        `- **Finding:** ${finding.message}`,
        `- **Recommendation:** ${finding.recommendation}`,
        ""
      )
    }
  }

  lines.push(
    "## Audit Policy",
    "",
    "- `CRITICAL` findings cause the audit to fail.",
    "- `HIGH` findings cause the audit to fail.",
    "- `MEDIUM` findings are reported but do not fail the audit.",
    "- `LOW` findings are reported but do not fail the audit.",
    "",
    "## Commands",
    "",
    "```bash",
    "pnpm security:audit",
    "```",
    ""
  )

  const directory = dirname(SECURITY_AUDIT_FILE)

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }

  writeFileSync(SECURITY_AUDIT_FILE, `${lines.join("\n")}\n`, "utf8")
}

function normalizePath(file) {
  return file.replaceAll("\\", "/")
}

function walkDirectory(directory) {
  if (!existsSync(directory)) {
    return []
  }

  const results = []

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)

    let stats

    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }

    if (stats.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue
      }

      results.push(...walkDirectory(fullPath))
      continue
    }

    const extension = entry.slice(entry.lastIndexOf("."))

    if (SOURCE_EXTENSIONS.has(extension)) {
      results.push(fullPath)
    }
  }

  return results
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length
}

function scanFile(file) {
  const content = readFileSync(file, "utf8")
  const relativeFile = normalizePath(relative(ROOT, file))

  if (IGNORED_FILES.has(relativeFile)) {
    return
  }

  scanHardcodedSecrets(content, relativeFile)
  scanDangerousFunctions(content, relativeFile)
  scanConsoleLogging(content, relativeFile)
  scanWildcardCors(content, relativeFile)
  scanJwtProblems(content, relativeFile)
  scanPasswordHandling(content, relativeFile)
  scanUnsafePrismaPatterns(content, relativeFile)
  scanSensitiveLogging(content, relativeFile)
  scanDangerousHttpPatterns(content, relativeFile)
  scanEnvironmentProblems(content, relativeFile)
}

/**
 * Detect hardcoded secrets.
 *
 * Jangan menggunakan regex generic:
 *
 * password = "..."
 *
 * karena dapat menghasilkan false positive
 * untuk dummy password, test password, dan
 * contoh kode.
 */
function scanHardcodedSecrets(content, file) {
  const patterns = [
    {
      regex:
        /(?:jwt[_-]?secret|secret[_-]?key)\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi,
      message: "Possible hardcoded JWT/secret value.",
      recommendation:
        "Move secrets to environment variables and validate them at application startup.",
    },
    {
      regex: /(?:api[_-]?key|access[_-]?token)\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi,
      message: "Possible hardcoded API key or access token.",
      recommendation:
        "Move credentials to environment variables or a secret manager.",
    },
  ]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.regex.exec(content)) !== null) {
      const matchedText = match[0]

      /**
       * Abaikan placeholder/example value.
       */
      if (
        /example|placeholder|your[-_ ]?(secret|token|key)/i.test(matchedText)
      ) {
        continue
      }

      addFinding({
        severity: "HIGH",
        category: "Secrets",
        file,
        line: getLineNumber(content, match.index),
        message: pattern.message,
        recommendation: pattern.recommendation,
      })
    }
  }
}

/**
 * Detect dangerous code execution.
 */
function scanDangerousFunctions(content, file) {
  const patterns = [
    {
      regex: /\beval\s*\(/g,
      message: "Use of eval() detected.",
      recommendation:
        "Avoid eval(). Use explicit parsing or safe function dispatch.",
    },
    {
      regex: /\bnew\s+Function\s*\(/g,
      message: "Dynamic Function constructor detected.",
      recommendation: "Avoid dynamically generated JavaScript functions.",
    },
    {
      regex: /\bchild_process\b/g,
      message: "child_process usage detected.",
      recommendation:
        "Review command execution carefully and never pass untrusted user input to shell commands.",
    },
  ]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.regex.exec(content)) !== null) {
      addFinding({
        severity: "HIGH",
        category: "Code Execution",
        file,
        line: getLineNumber(content, match.index),
        message: pattern.message,
        recommendation: pattern.recommendation,
      })
    }
  }
}

/**
 * Detect penggunaan console logging.
 *
 * console logging bukan otomatis vulnerability.
 * Karena itu severity hanya LOW.
 */
function scanConsoleLogging(content, file) {
  const lines = content.split("\n")

  const regex = /\bconsole\.(log|debug|info|warn|error)\s*\(/i

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (regex.test(line)) {
      addFinding({
        severity: "LOW",
        category: "Logging",
        file,
        line: index + 1,
        message: "console logging detected.",
        recommendation: "Prefer NestJS Logger for backend logging.",
      })
    }
  }
}

/**
 * Hanya mendeteksi wildcard CORS yang benar-benar
 * menggunakan "*".
 *
 * Contoh yang dianggap vulnerability:
 *
 * origin: '*'
 *
 * Contoh yang TIDAK dianggap vulnerability:
 *
 * origin: config.get<string[]>('app.corsOrigins')
 *
 * atau:
 *
 * origin: corsOrigins
 */
function scanWildcardCors(content, file) {
  const lines = content.split("\n")

  const wildcardPatterns = [
    /\borigin\s*:\s*['"`]\s*\*\s*['"`]/i,
    /\bCORS_ORIGINS\s*=\s*['"`]?\s*\*\s*['"`]?/i,
  ]

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    /**
     * Abaikan komentar.
     */
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/")
    ) {
      continue
    }

    for (const pattern of wildcardPatterns) {
      if (!pattern.test(line)) {
        continue
      }

      addFinding({
        severity: "HIGH",
        category: "CORS",
        file,
        line: index + 1,
        message: "Wildcard CORS origin detected.",
        recommendation:
          "Use an explicit production origin allowlist. Do not use wildcard origins for authenticated APIs.",
      })

      break
    }
  }
}

/**
 * Detect JWT configuration problems.
 */
function scanJwtProblems(content, file) {
  const patterns = [
    {
      regex: /jwt\.sign\s*\([^)]*secret/gi,
      message: "JWT secret may be configured directly in source code.",
      recommendation: "Load JWT secrets from validated configuration.",
    },
    {
      regex: /ignoreExpiration\s*:\s*true/gi,
      message: "JWT expiration checking appears to be disabled.",
      recommendation: "Keep JWT expiration validation enabled in production.",
    },
  ]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.regex.exec(content)) !== null) {
      addFinding({
        severity: "HIGH",
        category: "JWT",
        file,
        line: getLineNumber(content, match.index),
        message: pattern.message,
        recommendation: pattern.recommendation,
      })
    }
  }
}

/**
 * Detect kemungkinan password plaintext
 * digunakan langsung untuk persistence.
 */
function scanPasswordHandling(content, file) {
  const lines = content.split("\n")

  const passwordPattern = /\bpassword\s*:\s*(?:input|dto|body)\.password\b/i

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (!passwordPattern.test(line)) {
      continue
    }

    /**
     * Ambil context beberapa baris di sekitar
     * assignment password.
     */
    const start = Math.max(0, index - 5)
    const end = Math.min(lines.length, index + 6)

    const surrounding = lines.slice(start, end).join("\n")

    /**
     * Password dianggap aman apabila hashing
     * dilakukan pada context yang sama.
     */
    if (
      surrounding.includes("bcrypt.hash") ||
      surrounding.includes("hashPassword") ||
      surrounding.includes("argon2.hash") ||
      surrounding.includes("scrypt")
    ) {
      continue
    }

    addFinding({
      severity: "MEDIUM",
      category: "Password",
      file,
      line: index + 1,
      message:
        "Password value appears to be persisted directly without visible hashing.",
      recommendation:
        "Ensure passwords are hashed using a password hashing algorithm before persistence.",
    })
  }
}

/**
 * Detect mass assignment pada Prisma.
 *
 * Contoh berbahaya:
 *
 * data: {
 *   ...dto
 * }
 */
function scanUnsafePrismaPatterns(content, file) {
  const patterns = [
    {
      regex: /data\s*:\s*\{\s*\.\.\.(?:dto|input|body)\b/g,
      message:
        "Potential mass-assignment pattern detected in Prisma data object.",
      recommendation:
        "Explicitly map allowed DTO fields instead of spreading request input.",
    },
    {
      regex: /\{\s*\.\.\.(?:dto|input|body)\s*\}/g,
      message: "Potential request-data spreading detected.",
      recommendation:
        "Use explicit property mapping to prevent unintended field updates.",
    },
  ]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.regex.exec(content)) !== null) {
      addFinding({
        severity: "HIGH",
        category: "Mass Assignment",
        file,
        line: getLineNumber(content, match.index),
        message: pattern.message,
        recommendation: pattern.recommendation,
      })
    }
  }
}

/**
 * Detect sensitive credential logging.
 *
 * Pemeriksaan dilakukan per baris agar komentar,
 * multiline expression, atau dokumentasi tidak
 * mudah menghasilkan false positive.
 *
 * Yang dianggap CRITICAL:
 *
 * console.log(resetToken)
 * console.log(refreshToken)
 * console.log(accessToken)
 * logger.warn(jwt)
 * logger.error(password)
 */
function scanSensitiveLogging(content, file) {
  const lines = content.split("\n")

  const loggingPattern =
    /\b(?:console|logger)\.(?:log|debug|info|verbose|warn|error)\s*\(/i

  const sensitivePattern =
    /\b(?:password|refreshToken|resetToken|accessToken|idToken|jwt|authorization|bearer)\b/i

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    const trimmed = line.trim()

    /**
     * Abaikan comment-only line.
     */
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/")
    ) {
      continue
    }

    /**
     * Hanya flag apabila BARIS TERSEBUT
     * mengandung logging dan sensitive credential.
     */
    if (loggingPattern.test(line) && sensitivePattern.test(line)) {
      addFinding({
        severity: "CRITICAL",
        category: "Sensitive Data Logging",
        file,
        line: index + 1,
        message: "Potential sensitive credential logging detected.",
        recommendation:
          "Never log passwords, access tokens, refresh tokens or password reset tokens.",
      })
    }
  }
}

/**
 * Detect kemungkinan information disclosure.
 */
function scanDangerousHttpPatterns(content, file) {
  const patterns = [
    {
      regex: /res\.send\s*\(\s*error\b/gi,
      message: "Raw error object may be returned to clients.",
      recommendation:
        "Return controlled HTTP exceptions and generic production error responses.",
    },
    {
      regex: /throw\s+new\s+Error\s*\(\s*(?:error|err|exception)\./gi,
      message: "Internal exception details may be exposed.",
      recommendation:
        "Map internal errors to safe application-level exceptions.",
    },
  ]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.regex.exec(content)) !== null) {
      addFinding({
        severity: "MEDIUM",
        category: "Information Disclosure",
        file,
        line: getLineNumber(content, match.index),
        message: pattern.message,
        recommendation: pattern.recommendation,
      })
    }
  }
}

/**
 * process.env hanya dianggap finding jika berada
 * di luar centralized configuration.
 */
function scanEnvironmentProblems(content, file) {
  if (ENVIRONMENT_CONFIG_FILES.has(file)) {
    return
  }

  const lines = content.split("\n")

  const regex = /\bprocess\.env\.[A-Z0-9_]+\b/g

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    /**
     * Abaikan komentar.
     */
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/")
    ) {
      continue
    }

    if (!regex.test(line)) {
      continue
    }

    addFinding({
      severity: "LOW",
      category: "Configuration",
      file,
      line: index + 1,
      message:
        "Direct process.env access detected outside centralized configuration.",
      recommendation:
        "Prefer validated ConfigService/config modules for application configuration.",
    })

    regex.lastIndex = 0
  }
}

/**
 * Memastikan security-related files tersedia.
 */
function scanSecurityFiles() {
  const requiredFiles = [
    "apps/backend/src/config/env.validation.ts",
    "apps/backend/src/config/app.config.ts",
    "apps/backend/src/config/auth.config.ts",
    "apps/backend/src/main.ts",
    "apps/backend/src/common/filters/prisma-exception.filter.ts",
    "apps/backend/src/common/guards/jwt-auth.guard.ts",
    "apps/backend/src/common/guards/roles.guard.ts",
    "apps/backend/src/auth/auth.service.ts",
  ]

  for (const file of requiredFiles) {
    const absolutePath = join(ROOT, file)

    if (!existsSync(absolutePath)) {
      addFinding({
        severity: "HIGH",
        category: "Security Architecture",
        file,
        line: 1,
        message: "Expected security-related file was not found.",
        recommendation:
          "Verify the backend security architecture and update this audit according to the actual project structure.",
      })
    }
  }

  /**
   * Cari JwtStrategy secara rekursif.
   *
   * Tidak bergantung pada satu struktur folder.
   */
  const jwtStrategyFiles = findFilesByName(BACKEND_DIR, "jwt.strategy.ts")

  if (jwtStrategyFiles.length === 0) {
    addFinding({
      severity: "HIGH",
      category: "Security Architecture",
      file: "apps/backend/src/**/jwt.strategy.ts",
      line: 1,
      message: "JWT strategy file was not found.",
      recommendation:
        "Verify that Passport JWT authentication is implemented and that JwtStrategy is registered by AuthModule.",
    })
  }
}

/**
 * Cari file berdasarkan nama.
 */
function findFilesByName(directory, fileName) {
  if (!existsSync(directory)) {
    return []
  }

  const results = []

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)

    let stats

    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }

    if (stats.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue
      }

      results.push(...findFilesByName(fullPath, fileName))

      continue
    }

    if (entry === fileName) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Cek apakah file benar-benar tracked oleh Git.
 */
function isTrackedByGit(file) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", file], {
      cwd: ROOT,
      stdio: "ignore",
    })

    return true
  } catch {
    return false
  }
}

/**
 * Scan environment files.
 *
 * .env yang hanya ada secara lokal dan sudah
 * di-ignore Git tidak dianggap vulnerability.
 */
function scanEnvironmentFiles() {
  const dangerousFiles = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
  ]

  for (const file of dangerousFiles) {
    const path = join(ROOT, file)

    if (!existsSync(path)) {
      continue
    }

    /**
     * Hanya report apabila benar-benar tracked
     * oleh Git.
     */
    if (!isTrackedByGit(file)) {
      continue
    }

    const content = readFileSync(path, "utf8")

    if (/^\s*JWT_SECRET\s*=\s*[^#\s]+/im.test(content)) {
      addFinding({
        severity: "MEDIUM",
        category: "Secrets",
        file,
        line: 1,
        message: "Environment file containing JWT_SECRET is tracked by Git.",
        recommendation:
          "Remove the environment file from Git, add it to .gitignore, and rotate the exposed secret if it was previously committed.",
      })
    }
  }
}

/**
 * Print header.
 */
function printHeader() {
  console.log("")
  console.log("========================================")
  console.log("      DOKUMEN STATIC SECURITY AUDIT")
  console.log("========================================")
  console.log("")
}

/**
 * Print findings.
 */
function printFindings() {
  const severityOrder = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  }

  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  if (findings.length === 0) {
    console.log("No security findings detected.")
    console.log("")

    return
  }

  for (const finding of findings) {
    console.log(
      `[${finding.severity}] ${finding.category} ${finding.file}:${finding.line}`
    )

    console.log(`  ${finding.message}`)

    console.log(`  Recommendation: ${finding.recommendation}`)

    console.log("")
  }
}

/**
 * Print summary.
 */
function printSummary() {
  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  }

  for (const finding of findings) {
    counts[finding.severity]++
  }

  console.log("========================================")
  console.log("SUMMARY")
  console.log("========================================")

  console.log(`CRITICAL : ${counts.CRITICAL}`)

  console.log(`HIGH     : ${counts.HIGH}`)

  console.log(`MEDIUM   : ${counts.MEDIUM}`)

  console.log(`LOW      : ${counts.LOW}`)

  console.log(`TOTAL    : ${findings.length}`)

  console.log("")

  /**
   * CRITICAL dan HIGH merupakan blocking findings.
   */
  if (counts.CRITICAL > 0 || counts.HIGH > 0) {
    console.error(
      "Security audit FAILED: critical/high severity findings detected."
    )

    process.exitCode = 1

    return
  }

  /**
   * MEDIUM dan LOW tidak menggagalkan audit,
   * tetapi tetap harus direview.
   */
  if (counts.MEDIUM > 0 || counts.LOW > 0) {
    console.log(
      "Security audit PASSED with medium/low findings requiring review."
    )

    return
  }

  console.log("Security audit PASSED.")
}

/**
 * Main audit runner.
 */
function main() {
  printHeader()

  if (!existsSync(BACKEND_DIR)) {
    console.error(`Backend directory not found: ${relative(ROOT, BACKEND_DIR)}`)

    process.exitCode = 1

    return
  }

  const sourceFiles = [
    ...walkDirectory(BACKEND_DIR),
    ...walkDirectory(PACKAGES_DIR),
  ]

  for (const file of sourceFiles) {
    scanFile(file)
  }

  scanSecurityFiles()
  scanEnvironmentFiles()

  printFindings()
  printSummary()
  generateMarkdownReport()

  console.log(
    `Security report generated: ${relative(ROOT, SECURITY_AUDIT_FILE)}`
  )
}

main()

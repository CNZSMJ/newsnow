import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

interface Finding {
  file: string
  message: string
}

const rootDir = process.cwd()
const findings: Finding[] = []

function readDoc(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), "utf8")
}

function exists(relativePath: string): boolean {
  return existsSync(join(rootDir, relativePath))
}

function fail(file: string, message: string): void {
  findings.push({ file, message })
}

function requireFile(relativePath: string): void {
  if (!exists(relativePath)) {
    fail(relativePath, "required document is missing")
  }
}

function requireContains(relativePath: string, needle: string, message: string): void {
  if (!exists(relativePath)) {
    fail(relativePath, "required document is missing")
    return
  }

  if (!readDoc(relativePath).includes(needle)) {
    fail(relativePath, message)
  }
}

function statusLine(content: string): string {
  return content.match(/^状态[:：](.+)$/m)?.[1]?.trim() ?? ""
}

function isImplementationState(status: string): boolean {
  return [
    "Ready for Implementation",
    "In Progress",
    "Validation",
    "Completed",
    "待实现",
    "实施中",
    "验证中",
    "已完成",
  ].some(value => status.includes(value))
}

function hasCompletedConsistencyCheck(content: string): boolean {
  return content.includes("一致性检查已完成")
    || content.includes("一致性检查：已完成")
    || content.includes("一致性检查: 已完成")
}

function listDirectories(relativePath: string): string[] {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return []
  }

  return readdirSync(absolutePath)
    .filter(entry => !entry.startsWith("."))
    .filter(entry => statSync(join(absolutePath, entry)).isDirectory())
    .sort()
}

function listMarkdownFiles(relativePath: string): string[] {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return []
  }

  return readdirSync(absolutePath)
    .filter(entry => entry.endsWith(".md"))
    .filter(entry => statSync(join(absolutePath, entry)).isFile())
    .sort()
}

function checkGovernanceEntrypoints(): void {
  requireContains("docs/README.md", "pnpm docs:check", "README must document the docs governance check command")
  requireContains("docs/README.md", "审批通过", "README must define the approved technical-design gate")
  requireContains("docs/README.md", "implementation-plan.md", "README must require implementation plans for backlog execution")
  requireContains("docs/README.md", "backlog/<YYYYMMDD-slug>", "README must define backlog branch naming")
  requireContains("docs/README.md", "hotfix/<YYYYMMDD-fix-slug>", "README must define hotfix branch naming")

  requireContains("docs/prompt/agent-start-prompt.md", "审批通过", "agent start prompt must check technical-design approval")
  requireContains("docs/prompt/agent-start-prompt.md", "一致性检查", "agent start prompt must check plan/design consistency")
  requireContains("docs/prompt/agent-start-prompt.md", "pnpm docs:check", "agent start prompt must require docs governance check before commit")
}

function checkBacklogs(): void {
  const requiredFiles = [
    "research.md",
    "decisions.md",
    "product-spec.md",
    "technical-design.md",
    "implementation-plan.md",
    "delivery-status.md",
  ]

  for (const dirname of listDirectories("docs/backlog")) {
    const basePath = `docs/backlog/${dirname}`
    for (const file of requiredFiles) {
      requireFile(`${basePath}/${file}`)
    }

    const deliveryStatusPath = `${basePath}/delivery-status.md`
    const deliveryStatus = exists(deliveryStatusPath) ? readDoc(deliveryStatusPath) : ""
    const currentStatus = statusLine(deliveryStatus)
    const requiresImplementationGate = isImplementationState(currentStatus)

    const technicalDesignPath = `${basePath}/technical-design.md`
    if (exists(technicalDesignPath)) {
      const status = statusLine(readDoc(technicalDesignPath))
      if (requiresImplementationGate && !status.includes("审批通过")) {
        fail(technicalDesignPath, "technical-design status must include 审批通过 before implementation")
      }
    }

    const implementationPlanPath = `${basePath}/implementation-plan.md`
    if (exists(implementationPlanPath)) {
      const implementationPlan = readDoc(implementationPlanPath)
      if (!implementationPlan.includes("technical-design.md") || !implementationPlan.includes("一致性检查")) {
        fail(implementationPlanPath, "implementation plan must declare consistency check with technical-design.md")
      }
      if (requiresImplementationGate && !hasCompletedConsistencyCheck(implementationPlan)) {
        fail(implementationPlanPath, "implementation plan must declare completed consistency check before implementation")
      }
    }

    if (exists(deliveryStatusPath)) {
      if (!currentStatus) {
        fail(deliveryStatusPath, "delivery-status must include a 状态 line")
      }
      if ((currentStatus.includes("Completed") || currentStatus.includes("已完成")) && !deliveryStatus.includes("验证记录")) {
        fail(deliveryStatusPath, "completed backlog must include validation records")
      }
    }

    for (const reviewFile of listMarkdownFiles(basePath).filter(file => file.includes("review"))) {
      const reviewPath = `${basePath}/${reviewFile}`
      const reviewDoc = readDoc(reviewPath)
      if (!reviewDoc.includes("闭环") && !reviewDoc.includes("无开放")) {
        fail(reviewPath, "review document must state whether review findings are closed or open")
      }
    }
  }
}

function checkHotfixes(): void {
  const requiredSections = [
    "## 1. 问题现象描述",
    "## 2. 问题的根因分析",
    "## 3. 修复方案",
    "## 4. 实施计划",
    "## 5. 实施状态",
  ]

  for (const filename of listMarkdownFiles("docs/hotfix")) {
    const hotfixPath = `docs/hotfix/${filename}`
    const hotfix = readDoc(hotfixPath)
    for (const section of requiredSections) {
      if (!hotfix.includes(section)) {
        fail(hotfixPath, `hotfix document must include section: ${section}`)
      }
    }
    if (!hotfix.includes("修复方案") || !hotfix.includes("一致性检查")) {
      fail(hotfixPath, "hotfix implementation plan must declare consistency check with 修复方案")
    }
  }
}

checkGovernanceEntrypoints()
checkBacklogs()
checkHotfixes()

if (findings.length > 0) {
  console.error(JSON.stringify({
    status: "failed",
    findingCount: findings.length,
    findings,
  }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({
    status: "passed",
    checked: {
      backlogCount: listDirectories("docs/backlog").length,
      hotfixCount: listMarkdownFiles("docs/hotfix").length,
    },
  }, null, 2))
}

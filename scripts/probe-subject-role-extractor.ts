import {
  getLiveSubjectRoleExtractor,
  getLiveSubjectRoleExtractorStatus,
  getLiveSubjectRoleExtractorTimeoutMs,
} from "#/services/event-engine/subject-role-live-extractor"
import { resolveEventSubjects } from "#/services/event-engine/subject-resolution"

async function main() {
  const status = getLiveSubjectRoleExtractorStatus()
  const extractor = getLiveSubjectRoleExtractor()

  const result = await resolveEventSubjects({
    eventId: "evt_subject_probe",
    title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
    summary: "魏哲家称，对2026年台积全年营收以美元计成长超过30%充满信心。",
    eventType: "industry",
    eventSubType: "industry_news",
    sourceKind: "media_analysis",
    topicTags: ["ai-computing"],
    affectedMarkets: ["A", "HK"],
    payload: {
      id: "raw_subject_probe",
      title: "台积电法说会：AI需求极为强劲，供不应求将持续至至少2027年",
      url: "https://example.com/tsmc-briefing",
      extra: {
        info: "管理层强调先进封装和AI需求持续强劲。",
      },
    },
  }, {
    roleExtractor: extractor,
    extractionTimeoutMs: getLiveSubjectRoleExtractorTimeoutMs(),
    registryResolver: {
      resolveByName: async () => null,
      resolveByCode: async () => null,
    },
  })

  console.log(JSON.stringify({
    status,
    primaryEntityName: result.primaryEntityName ?? null,
    entityLinks: result.entityLinks,
    audit: result.audit,
  }, null, 2))

  if (!status.enabled) {
    process.exitCode = 1
  }
}

void main()

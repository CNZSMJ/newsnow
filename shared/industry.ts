import { typeSafeObjectFromEntries } from "./type.util"

export const industries = {
  semiconductor: "半导体",
  photovoltaic: "光伏",
  "new-energy-vehicle": "新能源车",
  medicine: "医药",
  "ai-computing": "AI/算力",
  steel: "钢铁",
  "non-ferrous": "有色",
  chemical: "化工",
} as const

export type IndustryTag = keyof typeof industries

export const allIndustryTags = Object.keys(industries) as IndustryTag[]

export const industryAliases: Record<IndustryTag, string[]> = {
  semiconductor: ["半导体", "芯片", "集成电路", "存储芯片", "光芯片", "cpo", "算力芯片"],
  photovoltaic: ["光伏", "太阳能", "储能", "硅料", "硅片", "组件", "电池片"],
  "new-energy-vehicle": ["新能源车", "新能源汽车", "电动车", "锂电", "动力电池", "智能驾驶", "车路云"],
  medicine: ["医药", "创新药", "生物医药", "医疗", "医疗器械", "cxo", "cro", "药审", "医保", "减肥药"],
  "ai-computing": ["ai", "人工智能", "算力", "大模型", "智算", "gpu", "液冷", "服务器", "数据中心"],
  steel: ["钢铁", "粗钢", "螺纹钢", "热卷", "钢材"],
  "non-ferrous": ["有色", "铜", "铝", "锂", "镍", "钴", "稀土"],
  chemical: ["化工", "化学", "农药", "化肥", "纯碱", "烧碱", "pvc"],
}

export const industryGroupLabels = [
  "综合",
  ...Object.values(industries),
] as const

const industryGroupRank = typeSafeObjectFromEntries(industryGroupLabels.map((label, index) => [label, index] as const))

export function getIndustryGroupLabel(tags?: readonly IndustryTag[] | null) {
  if (!tags?.length) return "综合"
  if (tags.length !== 1) return "综合"
  return industries[tags[0]]
}

export function getIndustryGroupRank(tags?: readonly IndustryTag[] | null) {
  return industryGroupRank[getIndustryGroupLabel(tags)]
}

export function resolveIndustryTagsFromKeywordQuery(query?: string | null) {
  if (!query) return [] as IndustryTag[]
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [] as IndustryTag[]

  const matched: IndustryTag[] = []
  for (const tag of allIndustryTags) {
    const label = industries[tag].toLowerCase()
    const aliases = industryAliases[tag]
    if (
      normalized.includes(label)
      || aliases.some(alias => normalized.includes(alias.toLowerCase()))
    ) {
      matched.push(tag)
    }
  }
  return matched
}

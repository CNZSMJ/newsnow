import { typeSafeObjectFromEntries } from "./type.util"

export const industries = {
  "semiconductor": "半导体",
  "photovoltaic": "光伏",
  "new-energy-vehicle": "新能源车",
  "power-battery": "动力电池",
  "medicine": "医药",
  "ai-computing": "AI/算力",
  "cloud-infrastructure": "云基础设施",
  "communication-equipment": "通信设备",
  "robotics": "机器人",
  "manufacturing": "制造业",
  "steel": "钢铁",
  "non-ferrous": "有色",
  "chemical": "化工",
} as const

export type IndustryTag = keyof typeof industries

export const allIndustryTags = Object.keys(industries) as IndustryTag[]
export const broadIndustryTagThreshold = 8

export function isBroadIndustryTagSet(tags?: readonly IndustryTag[] | null) {
  return (tags?.length ?? 0) >= Math.min(broadIndustryTagThreshold, allIndustryTags.length)
}

export const industryAliases: Record<IndustryTag, string[]> = {
  "semiconductor": ["半导体", "芯片", "集成电路", "存储芯片", "光芯片", "cpo", "算力芯片"],
  "photovoltaic": ["光伏", "太阳能", "储能", "硅料", "硅片", "组件", "电池片"],
  "new-energy-vehicle": ["新能源车", "新能源汽车", "电动车", "锂电", "动力电池", "智能驾驶", "车路云"],
  "power-battery": ["动力电池", "电池装机", "装机量", "电池材料", "锂电池", "储能电池"],
  "medicine": ["医药", "创新药", "生物医药", "医疗", "医疗器械", "cxo", "cro", "药审", "医保", "减肥药"],
  "ai-computing": ["ai", "人工智能", "算力", "大模型", "智算", "gpu", "液冷", "服务器", "数据中心"],
  "cloud-infrastructure": ["云基础设施", "ai服务器", "ai server", "云计算", "数据中心", "服务器", "交换机", "液冷"],
  "communication-equipment": ["光模块", "光通信", "通信设备", "电信设备", "光传输", "数通", "光网络"],
  "robotics": ["机器人", "工业机器人", "人形机器人", "工业自动化", "自动化设备", "工控", "机器视觉"],
  "manufacturing": ["制造业", "工业经济", "工业增加值", "工业企业", "进出口", "pmi", "智能制造"],
  "steel": ["钢铁", "粗钢", "螺纹钢", "热卷", "钢材"],
  "non-ferrous": ["有色", "铜", "铝", "锂", "镍", "钴", "稀土"],
  "chemical": ["化工", "化学", "农药", "化肥", "纯碱", "烧碱", "pvc"],
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

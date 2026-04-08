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

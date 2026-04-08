import { Command } from "cmdk"
import { useMount } from "react-use"
import type { SourceID } from "@shared/types"
import { useMemo, useRef, useState } from "react"
import { getIndustryGroupLabel, industryGroupLabels, industries } from "@shared/industry"
import pinyin from "@shared/pinyin.json"
import { OverlayScrollbar } from "../overlay-scrollbar"
import { CardWrapper } from "~/components/column/card"

import "./cmdk.css"

interface SourceItemProps {
  id: SourceID
  name: string
  title?: string
  section: string
  pinyin: string
  tags: string[]
}

function getSectionRank(section: string) {
  if (section === "科技") return 0
  if (section.startsWith("产业 / ")) {
    const industry = section.slice("产业 / ".length)
    const index = industryGroupLabels.indexOf(industry as any)
    return 1 + (index >= 0 ? index : industryGroupLabels.length)
  }
  if (section === "国内") return 100
  if (section === "国际") return 101
  if (section === "财经") return 102
  if (section === "未分类") return 999
  return 500
}

function groupBySection(items: SourceItemProps[]) {
  return items.reduce((acc, item) => {
    const k = acc.find(i => i.section === item.section)
    if (k) k.sources = [...k.sources, item]
    else acc.push({ section: item.section, sources: [item] })
    return acc
  }, [] as {
    section: string
    sources: SourceItemProps[]
  }[]).sort((m, n) => {
    const diff = getSectionRank(m.section) - getSectionRank(n.section)
    if (diff !== 0) return diff
    return m.section < n.section ? -1 : 1
  })
}

export function SearchBar() {
  const { opened, toggle } = useSearchBar()
  const sourceItems = useMemo(
    () =>
      groupBySection(typeSafeObjectEntries(sources)
        .filter(([_, source]) => !source.redirect)
        .map(([k, source]) => ({
          id: k,
          title: source.title,
          section: source.column
            ? source.column === "industry"
              ? `产业 / ${getIndustryGroupLabel(source.tags)}`
              : columns[source.column].zh
            : "未分类",
          name: source.name,
          pinyin: pinyin?.[k as keyof typeof pinyin] ?? "",
          tags: (source.tags ?? []).map(tag => industries[tag]),
        })))
    , [],
  )
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [value, setValue] = useState<SourceID>("github-trending-today")

  useMount(() => {
    inputRef?.current?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener("keydown", keydown)
    return () => {
      document.removeEventListener("keydown", keydown)
    }
  })

  return (
    <Command.Dialog
      open={opened}
      onOpenChange={toggle}
      value={value}
      onValueChange={(v) => {
        if (v in sources) {
          setValue(v as SourceID)
        }
      }}
    >
      <Command.Input
        ref={inputRef}
        autoFocus
        placeholder="搜索你想要的"
      />
      <div className="md:flex pt-2">
        <OverlayScrollbar defer className="overflow-y-auto md:min-w-275px">
          <Command.List>
            <Command.Empty> 没有找到，可以前往 Github 提 issue </Command.Empty>
            {
              sourceItems.map(({ section, sources }) => (
                <Command.Group heading={section} key={section}>
                  {
                    sources.map(item => <SourceItem item={item} key={item.id} />)
                  }
                </Command.Group>
              ),
              )
            }
          </Command.List>
        </OverlayScrollbar>
        <div className="flex-1 pt-2 px-4 min-w-350px max-md:hidden">
          <CardWrapper id={value} />
        </div>
      </div>
    </Command.Dialog>
  )
}

function SourceItem({ item }: {
  item: SourceItemProps
}) {
  const { isFocused, toggleFocus } = useFocusWith(item.id)
  return (
    <Command.Item
      keywords={[item.name, item.title ?? "", item.pinyin, ...item.tags]}
      value={item.id}
      className="flex justify-between items-center p-2"
      onSelect={toggleFocus}
    >
      <span className="flex gap-2 items-center min-w-0">
        <span
          className={$("w-4 h-4 rounded-md bg-cover")}
          style={{
            backgroundImage: `url(/icons/${item.id.split("-")[0]}.png), url(/icons/default.png)`,
          }}
        />
        <span className="flex flex-col min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{item.name}</span>
            <span className="text-xs text-neutral-400/80 self-end mb-3px">{item.title}</span>
          </span>
          {!!item.tags.length && (
            <span className="flex gap-1 flex-wrap mt-0.5">
              {item.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-neutral-400/10 text-neutral-500">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className={$(isFocused ? "i-ph-star-fill" : "i-ph-star-duotone", "bg-primary op-40")}></span>
    </Command.Item>
  )
}

import process from "node:process"
import { Interval } from "./consts"
import { allIndustryTags } from "./industry"
import { typeSafeObjectFromEntries } from "./type.util"
import type { OriginSource, Source, SourceID } from "./types"

const Time = {
  Test: 1,
  UltraFast: 60 * 1000,
  Realtime: 2 * 60 * 1000,
  Fast: 5 * 60 * 1000,
  Default: Interval, // 10min
  Common: 30 * 60 * 1000,
  Slow: 60 * 60 * 1000,
}

export const originSources = {
  "v2ex": {
    name: "V2EX",
    color: "slate",
    home: "https://v2ex.com/",
    sub: {
      share: {
        title: "最新分享",
        column: "tech",
      },
    },
  },
  "zhihu": {
    name: "知乎",
    type: "hottest",
    column: "china",
    color: "blue",
    home: "https://www.zhihu.com",
  },
  "weibo": {
    name: "微博",
    title: "实时热搜",
    type: "hottest",
    column: "china",
    color: "red",
    interval: Time.Realtime,
    home: "https://weibo.com",
  },
  "zaobao": {
    name: "联合早报",
    interval: Time.Common,
    type: "realtime",
    column: "world",
    color: "red",
    desc: "来自第三方网站: 早晨报",
    home: "https://www.zaobao.com",
  },
  "coolapk": {
    name: "酷安",
    type: "hottest",
    column: "tech",
    color: "green",
    title: "今日最热",
    home: "https://coolapk.com",
  },
  "mktnews": {
    name: "MKTNews",
    column: "finance",
    home: "https://mktnews.net",
    color: "indigo",
    interval: Time.UltraFast,
    sub: {
      flash: {
        title: "快讯",
      },
    },
  },
  "wallstreetcn": {
    name: "华尔街见闻",
    color: "blue",
    column: "finance",
    home: "https://wallstreetcn.com/",
    sub: {
      quick: {
        type: "realtime",
        interval: Time.UltraFast,
        title: "快讯",
      },
      news: {
        title: "最新",
        interval: Time.Common,
      },
      hot: {
        title: "最热",
        type: "hottest",
        interval: Time.Common,
      },
    },
  },
  "36kr": {
    name: "36氪",
    type: "realtime",
    color: "blue",
    home: "https://36kr.com",
    column: "tech",
    sub: {
      quick: {
        title: "快讯",
      },
      renqi: {
        type: "hottest",
        title: "人气榜",
      },
    },
  },
  "douyin": {
    name: "抖音",
    type: "hottest",
    column: "china",
    color: "gray",
    home: "https://www.douyin.com",
  },
  "hupu": {
    name: "虎扑",
    home: "https://hupu.com",
    column: "china",
    title: "主干道热帖",
    type: "hottest",
    color: "red",
  },
  "tieba": {
    name: "百度贴吧",
    title: "热议",
    column: "china",
    type: "hottest",
    color: "blue",
    home: "https://tieba.baidu.com",
  },
  "toutiao": {
    name: "今日头条",
    type: "hottest",
    column: "china",
    color: "red",
    home: "https://www.toutiao.com",
  },
  "ithome": {
    name: "IT之家",
    color: "red",
    column: "tech",
    type: "realtime",
    home: "https://www.ithome.com",
  },
  "thepaper": {
    name: "澎湃新闻",
    interval: Time.Common,
    type: "hottest",
    column: "china",
    title: "热榜",
    color: "gray",
    home: "https://www.thepaper.cn",
  },
  "sputniknewscn": {
    name: "卫星通讯社",
    color: "orange",
    column: "world",
    home: "https://sputniknews.cn",
  },
  "cankaoxiaoxi": {
    name: "参考消息",
    color: "red",
    column: "world",
    interval: Time.Common,
    home: "https://china.cankaoxiaoxi.com",
  },
  "pcbeta": {
    name: "远景论坛",
    color: "blue",
    column: "tech",
    home: "https://bbs.pcbeta.com",
    sub: {
      windows11: {
        title: "Win11",
        type: "realtime",
        interval: Time.Fast,
      },
      windows: {
        title: "Windows 资源",
        type: "realtime",
        interval: Time.Fast,
        disable: true,
      },
    },
  },
  "cls": {
    name: "财联社",
    color: "red",
    column: "finance",
    home: "https://www.cls.cn",
    sub: {
      telegraph: {
        title: "电报",
        interval: Time.UltraFast,
        type: "realtime",
      },
      depth: {
        title: "深度",
      },
      hot: {
        title: "热门",
        type: "hottest",
      },
    },
  },
  "xueqiu": {
    name: "雪球",
    color: "blue",
    home: "https://xueqiu.com",
    column: "finance",
    sub: {
      hotstock: {
        title: "热门股票",
        interval: Time.Realtime,
        type: "hottest",
      },
    },
  },
  "gelonghui": {
    name: "格隆汇",
    color: "blue",
    title: "事件",
    column: "finance",
    type: "realtime",
    interval: Time.UltraFast,
    home: "https://www.gelonghui.com",
  },
  "fastbull": {
    name: "法布财经",
    color: "emerald",
    home: "https://www.fastbull.cn",
    column: "finance",
    sub: {
      express: {
        title: "快讯",
        type: "realtime",
        interval: Time.UltraFast,
      },
      news: {
        title: "头条",
        interval: Time.Common,
      },
    },
  },
  "eastmoney": {
    name: "东方财富",
    color: "orange",
    column: "finance",
    home: "https://kuaixun.eastmoney.com/",
    sub: {
      "7x24": {
        title: "7x24",
        type: "realtime",
        interval: Time.UltraFast,
      },
    },
  },
  "sina": {
    name: "新浪财经",
    color: "red",
    column: "finance",
    home: "https://finance.sina.com.cn/7x24/",
    sub: {
      "7x24": {
        title: "7x24",
        type: "realtime",
        interval: Time.UltraFast,
      },
    },
  },
  "pbc": {
    name: "人民银行",
    color: "amber",
    column: "finance",
    home: "https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html",
    sub: {
      news: {
        title: "新闻发布",
        interval: Time.Default,
      },
    },
  },
  "safe": {
    name: "外汇局",
    color: "cyan",
    column: "finance",
    home: "https://www.safe.gov.cn/",
    sub: {
      latest: {
        title: "外汇动态",
        interval: Time.Default,
      },
    },
  },
  "csrc": {
    name: "证监会",
    color: "amber",
    column: "finance",
    home: "https://www.csrc.gov.cn",
    sub: {
      policy: {
        title: "政策解读",
        interval: Time.Default,
      },
      press: {
        title: "新闻发布会",
        interval: Time.Default,
      },
    },
  },
  "hkexnews": {
    name: "披露易",
    color: "red",
    column: "finance",
    home: "https://www.hkexnews.hk",
    sub: {
      latest: {
        title: "最新公告",
        interval: Time.Fast,
      },
      results: {
        title: "业绩公告",
        interval: Time.Fast,
      },
      halt: {
        title: "停复牌",
        interval: Time.UltraFast,
      },
    },
  },
  "sse": {
    name: "上交所",
    color: "blue",
    column: "finance",
    home: "https://www.sse.com.cn",
    sub: {
      latest: {
        title: "最新公告",
        interval: Time.Fast,
      },
    },
  },
  "szse": {
    name: "深交所",
    color: "sky",
    column: "finance",
    home: "https://www.szse.cn/index/index.html",
    sub: {
      news: {
        title: "交易所要闻",
        interval: Time.Default,
      },
    },
  },
  "cninfo": {
    name: "巨潮资讯",
    color: "indigo",
    column: "finance",
    home: "https://www.cninfo.com.cn",
    sub: {
      szse: {
        title: "深市公告",
        interval: Time.Fast,
      },
      sse: {
        title: "沪市公告",
        interval: Time.Fast,
      },
      "hk-main": {
        title: "港主板公告",
        interval: Time.Fast,
      },
      "hk-gem": {
        title: "港创业板公告",
        interval: Time.Fast,
      },
      "hk-disclosure": {
        title: "港股股本变动",
        interval: Time.Fast,
      },
    },
  },
  "miit": {
    name: "工信部",
    color: "sky",
    column: "industry",
    home: "https://www.miit.gov.cn/xwdt/gxdt/sjdt/index.html",
    sub: {
      industry: {
        title: "司局动态",
        interval: Time.Default,
        tags: [
          "semiconductor",
          "photovoltaic",
          "new-energy-vehicle",
          "ai-computing",
          "steel",
          "non-ferrous",
          "chemical",
        ],
      },
    },
  },
  "ndrc": {
    name: "发改委",
    color: "emerald",
    column: "industry",
    home: "https://www.ndrc.gov.cn/xwdt/dt/sjdt/",
    sub: {
      industry: {
        title: "司局动态",
        interval: Time.Default,
        tags: [
          "semiconductor",
          "photovoltaic",
          "new-energy-vehicle",
          "medicine",
          "ai-computing",
          "steel",
          "non-ferrous",
          "chemical",
        ],
      },
    },
  },
  "stats": {
    name: "统计局",
    color: "teal",
    column: "industry",
    home: "https://www.stats.gov.cn/sj/zxfb/",
    sub: {
      industry: {
        title: "数据发布",
        interval: Time.Common,
        tags: allIndustryTags,
      },
    },
  },
  "nea": {
    name: "国家能源局",
    color: "amber",
    column: "industry",
    home: "https://www.nea.gov.cn/",
    sub: {
      release: {
        title: "新闻发布",
        interval: Time.Default,
        tags: ["photovoltaic", "new-energy-vehicle"],
      },
    },
  },
  "nhsa": {
    name: "国家医保局",
    color: "cyan",
    column: "industry",
    home: "https://www.nhsa.gov.cn/col/col14/index.html",
    sub: {
      dynamic: {
        title: "医保动态",
        interval: Time.Default,
        tags: ["medicine"],
      },
    },
  },
  "chinaisa": {
    name: "钢铁工业协会",
    color: "gray",
    column: "industry",
    home: "https://www.chinaisa.org.cn/gxportal/xfgl/portal/index.html",
    sub: {
      stats: {
        title: "统计发布",
        interval: Time.Common,
        tags: ["steel"],
      },
      analysis: {
        title: "行业分析",
        interval: Time.Common,
        tags: ["steel"],
      },
    },
  },
  "chinapv": {
    name: "光伏行业协会",
    color: "lime",
    column: "industry",
    home: "https://www.chinapv.org.cn/StaticPage/association_list28_1.html",
    sub: {
      policy: {
        title: "政策法规",
        interval: Time.Common,
        tags: ["photovoltaic"],
      },
    },
  },
  "chinania": {
    name: "有色工业网",
    color: "orange",
    column: "industry",
    home: "https://www.chinania.org.cn/",
    sub: {
      stats: {
        title: "行业统计",
        interval: Time.Common,
        tags: ["non-ferrous"],
      },
      policy: {
        title: "政策法规",
        interval: Time.Common,
        tags: ["non-ferrous"],
      },
      news: {
        title: "行业新闻",
        interval: Time.Common,
        tags: ["non-ferrous"],
      },
    },
  },
  "semi": {
    name: "SEMI",
    color: "blue",
    column: "industry",
    home: "https://www.semi.org.cn/",
    sub: {
      semiconductor: {
        title: "半导体",
        interval: Time.Common,
        tags: ["semiconductor"],
      },
      data: {
        title: "SEMI数据",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing"],
      },
    },
  },
  "cnchemicals": {
    name: "CCM",
    color: "emerald",
    column: "industry",
    home: "https://www.cnchemicals.com/news",
    sub: {
      industry: {
        title: "化工资讯",
        interval: Time.Common,
        tags: ["chemical"],
      },
    },
  },
  "caam": {
    name: "中汽协",
    color: "red",
    column: "industry",
    home: "http://www.caam.org.cn/tjsj",
    sub: {
      "nev-stats": {
        title: "新能源汽车统计",
        interval: Time.Common,
        tags: ["new-energy-vehicle"],
      },
      "nev-policy": {
        title: "新能源汽车政策",
        interval: Time.Common,
        tags: ["new-energy-vehicle"],
      },
      "nev-news": {
        title: "新能源汽车行业新闻",
        interval: Time.Default,
        tags: ["new-energy-vehicle"],
      },
    },
  },
  "cde": {
    name: "药审中心",
    color: "rose",
    column: "industry",
    home: "https://www.cde.org.cn",
    sub: {
      news: {
        title: "滚动新闻",
        interval: Time.Default,
        tags: ["medicine"],
      },
      policy: {
        title: "法律法规",
        interval: Time.Common,
        tags: ["medicine"],
      },
      rules: {
        title: "中心制度",
        interval: Time.Common,
        tags: ["medicine"],
      },
    },
  },
  "caict": {
    name: "信通院",
    color: "blue",
    column: "industry",
    home: "https://gma.caict.ac.cn/plat/news",
    sub: {
      "ai-news": {
        title: "算力/AI资讯",
        interval: Time.Common,
        tags: ["ai-computing"],
      },
      "ai-reports": {
        title: "算力/AI报告",
        interval: Time.Common,
        tags: ["ai-computing"],
      },
    },
  },
  "gov": {
    name: "中国政府网",
    color: "red",
    column: "industry",
    home: "https://www.gov.cn/yaowen/liebiao/",
    sub: {
      latest: {
        title: "国务院要闻",
        interval: Time.Common,
      },
    },
  },
  "sasac": {
    name: "国资委",
    color: "slate",
    column: "industry",
    home: "http://www.sasac.gov.cn/n2588025/n2588119/index.html",
    sub: {
      latest: {
        title: "国资动态",
        interval: Time.Default,
      },
    },
  },
  "mof": {
    name: "财政部",
    color: "emerald",
    column: "industry",
    home: "https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/",
    sub: {
      news: {
        title: "财政新闻",
        interval: Time.Common,
      },
    },
  },
  "mofcom": {
    name: "商务部",
    color: "blue",
    column: "industry",
    home: "https://www.mofcom.gov.cn/",
    sub: {
      release: {
        title: "日常新闻发布",
        interval: Time.Default,
      },
      spokesperson: {
        title: "发言人谈话",
        interval: Time.Default,
      },
    },
  },
  "solidot": {
    name: "Solidot",
    color: "teal",
    column: "tech",
    home: "https://solidot.org",
    interval: Time.Slow,
  },
  "hackernews": {
    name: "Hacker News",
    color: "orange",
    column: "tech",
    type: "hottest",
    home: "https://news.ycombinator.com/",
  },
  "producthunt": {
    name: "Product Hunt",
    color: "red",
    column: "tech",
    type: "hottest",
    home: "https://www.producthunt.com/",
  },
  "github": {
    name: "Github",
    color: "gray",
    home: "https://github.com/",
    column: "tech",
    sub: {
      "trending-today": {
        title: "Today",
        type: "hottest",
      },
    },
  },
  "bilibili": {
    name: "哔哩哔哩",
    color: "blue",
    home: "https://www.bilibili.com",
    sub: {
      "hot-search": {
        title: "热搜",
        column: "china",
        type: "hottest",
      },
      "hot-video": {
        title: "热门视频",
        disable: "cf",
        column: "china",
        type: "hottest",
      },
      "ranking": {
        title: "排行榜",
        column: "china",
        disable: "cf",
        type: "hottest",
        interval: Time.Common,
      },
    },
  },
  "kuaishou": {
    name: "快手",
    type: "hottest",
    column: "china",
    color: "orange",
    // cloudflare pages cannot access
    disable: "cf",
    home: "https://www.kuaishou.com",
  },
  "kaopu": {
    name: "靠谱新闻",
    column: "world",
    color: "gray",
    interval: Time.Common,
    desc: "不一定靠谱，多看多思考",
    home: "https://kaopu.news/",
  },
  "jin10": {
    name: "金十数据",
    column: "finance",
    color: "blue",
    type: "realtime",
    interval: Time.UltraFast,
    home: "https://www.jin10.com",
  },
  "baidu": {
    name: "百度热搜",
    column: "china",
    color: "blue",
    type: "hottest",
    home: "https://www.baidu.com",
  },
  "linuxdo": {
    name: "LINUX DO",
    column: "tech",
    color: "slate",
    home: "https://linux.do/",
    disable: true,
    sub: {
      latest: {
        title: "最新",
        home: "https://linux.do/latest",
      },
      hot: {
        title: "今日最热",
        type: "hottest",
        interval: Time.Common,
        home: "https://linux.do/hot",
      },
    },
  },
  "ghxi": {
    name: "果核剥壳",
    column: "china",
    color: "yellow",
    home: "https://www.ghxi.com/",
    disable: true,
  },
  "smzdm": {
    name: "什么值得买",
    column: "china",
    color: "red",
    type: "hottest",
    home: "https://www.smzdm.com",
    disable: true,
  },
  "nowcoder": {
    name: "牛客",
    column: "china",
    color: "blue",
    type: "hottest",
    home: "https://www.nowcoder.com",
  },
  "sspai": {
    name: "少数派",
    column: "tech",
    color: "red",
    type: "hottest",
    home: "https://sspai.com",
  },
  "juejin": {
    name: "稀土掘金",
    column: "tech",
    color: "blue",
    type: "hottest",
    home: "https://juejin.cn",
  },
  "ifeng": {
    name: "凤凰网",
    column: "china",
    color: "red",
    type: "hottest",
    title: "热点资讯",
    home: "https://www.ifeng.com",
  },
  "chongbuluo": {
    name: "虫部落",
    column: "china",
    color: "green",
    home: "https://www.chongbuluo.com",
    sub: {
      latest: {
        title: "最新",
        interval: Time.Common,
        home: "https://www.chongbuluo.com/forum.php?mod=guide&view=newthread",
      },
      hot: {
        title: "最热",
        type: "hottest",
        interval: Time.Common,
        home: "https://www.chongbuluo.com/forum.php?mod=guide&view=hot",
      },
    },
  },
  "douban": {
    name: "豆瓣",
    column: "china",
    title: "热门电影",
    color: "green",
    type: "hottest",
    home: "https://www.douban.com",
  },
  "steam": {
    name: "Steam",
    column: "world",
    title: "在线人数",
    color: "blue",
    type: "hottest",
    home: "https://store.steampowered.com",
  },
  "tencent": {
    name: "腾讯新闻",
    column: "china",
    color: "blue",
    home: "https://news.qq.com",
    sub: {
      hot: {
        title: "综合早报",
        type: "hottest",
        interval: Time.Common,
        home: "https://news.qq.com/tag/aEWqxLtdgmQ=",
      },
    },
  },
  "freebuf": {
    name: "Freebuf",
    column: "china",
    title: "网络安全",
    color: "green",
    type: "hottest",
    home: "https://www.freebuf.com/",
  },

  "qqvideo": {
    name: "腾讯视频",
    column: "china",
    color: "blue",
    home: "https://v.qq.com/",
    sub: {
      "tv-hotsearch": {
        title: "热搜榜",
        type: "hottest",
        interval: Time.Common,
        home: "https://v.qq.com/channel/tv",

      },
    },
  },
  "iqiyi": {
    name: "爱奇艺",
    column: "china",
    color: "green",
    home: "https://www.iqiyi.com",
    sub: {
      "hot-ranklist": {
        title: "热播榜",
        type: "hottest",
        interval: Time.Common,
        home: "https://www.iqiyi.com",
      },
    },
  },
} as const satisfies Record<string, OriginSource>

export function genSources() {
  const _: [SourceID, Source][] = []

  Object.entries(originSources).forEach(([id, source]: [any, OriginSource]) => {
    const parent = {
      name: source.name,
      type: source.type,
      disable: source.disable,
      desc: source.desc,
      column: source.column,
      home: source.home,
      tags: source.tags,
      color: source.color ?? "primary",
      interval: source.interval ?? Time.Default,
    }
    if (source.sub && Object.keys(source.sub).length) {
      Object.entries(source.sub).forEach(([subId, subSource], i) => {
        if (i === 0) {
          _.push([
            id,
            {
              redirect: `${id}-${subId}`,
              ...parent,
              ...subSource,
            },
          ] as [any, Source])
        }
        _.push([`${id}-${subId}`, { ...parent, ...subSource }] as [
          any,
          Source,
        ])
      })
    } else {
      _.push([
        id,
        {
          title: source.title,
          ...parent,
        },
      ])
    }
  })

  return typeSafeObjectFromEntries(
    _.filter(([_, v]) => {
      if (v.disable === "cf" && process.env.CF_PAGES) {
        return false
      } else {
        return v.disable !== true
      }
    }),
  )
}

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

const profile = {
  mediaFastFeed: {
    sourceKind: "media_fast_feed",
    defaultEventType: "news",
    authorityLevel: "media",
    parserFamily: "media_fast",
    assetClasses: ["equity", "rates", "fx", "commodity", "credit", "fund"],
    markets: ["A", "HK", "CN_rates", "CN_macro", "global_macro"],
  } as const,
  marketMoveFeed: {
    sourceKind: "media_fast_feed",
    defaultEventType: "market_move",
    authorityLevel: "media",
    parserFamily: "media_fast",
    assetClasses: ["equity", "fund"],
    markets: ["A", "HK"],
  } as const,
  officialRateFixing: {
    sourceKind: "official_rate_fixing",
    defaultEventType: "macro",
    defaultEventSubType: "rate_fixing",
    authorityLevel: "official",
    parserFamily: "macro_rate",
    assetClasses: ["rates"],
    markets: ["CN_rates", "CN_macro"],
  } as const,
  officialCentralBankOperation: {
    sourceKind: "official_central_bank_operation",
    defaultEventType: "policy",
    defaultEventSubType: "monetary_policy",
    authorityLevel: "official",
    parserFamily: "central_bank_operation",
    assetClasses: ["rates", "fx", "credit"],
    markets: ["CN_rates", "CN_macro"],
  } as const,
  officialPolicyNotice: {
    sourceKind: "official_policy_notice",
    defaultEventType: "policy",
    authorityLevel: "official",
    parserFamily: "policy",
    assetClasses: ["equity", "rates", "fx", "commodity", "credit", "fund"],
    markets: ["A", "HK", "CN_rates", "CN_macro", "global_macro"],
  } as const,
  officialMacroRelease: {
    sourceKind: "official_macro_release",
    defaultEventType: "macro",
    defaultEventSubType: "macro_data",
    authorityLevel: "official",
    parserFamily: "macro_release",
    assetClasses: ["equity", "rates", "fx", "commodity", "credit", "fund"],
    markets: ["CN_macro", "CN_rates", "A", "HK"],
  } as const,
  exchangeDisclosure: {
    sourceKind: "exchange_disclosure",
    defaultEventType: "announcement",
    authorityLevel: "exchange",
    parserFamily: "exchange_announcement",
    assetClasses: ["equity", "fund"],
    markets: ["A", "HK"],
  } as const,
  industryStatRelease: {
    sourceKind: "industry_stat_release",
    defaultEventType: "industry",
    defaultEventSubType: "industry_data",
    authorityLevel: "association",
    parserFamily: "industry_stat",
    assetClasses: ["equity", "commodity"],
    markets: ["A", "HK", "CN_macro"],
  } as const,
  industryReportRelease: {
    sourceKind: "industry_report_release",
    defaultEventType: "industry",
    defaultEventSubType: "industry_report",
    authorityLevel: "association",
    parserFamily: "industry_report",
    assetClasses: ["equity", "commodity"],
    markets: ["A", "HK", "CN_macro"],
  } as const,
  industryNewsFeed: {
    sourceKind: "industry_news_feed",
    defaultEventType: "industry",
    defaultEventSubType: "industry_news",
    authorityLevel: "association",
    parserFamily: "industry_news",
    assetClasses: ["equity", "commodity"],
    markets: ["A", "HK", "CN_macro"],
  } as const,
  industryPolicyNotice: {
    sourceKind: "industry_policy_notice",
    defaultEventType: "policy",
    defaultEventSubType: "industrial_policy",
    authorityLevel: "association",
    parserFamily: "policy",
    assetClasses: ["equity", "commodity"],
    markets: ["A", "HK", "CN_macro"],
  } as const,
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
    eventProfile: profile.mediaFastFeed,
    sub: {
      flash: {
        title: "快讯",
        eventProfile: profile.mediaFastFeed,
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
        eventProfile: profile.mediaFastFeed,
      },
      news: {
        title: "最新",
        interval: Time.Common,
        eventProfile: profile.mediaFastFeed,
      },
      hot: {
        title: "最热",
        type: "hottest",
        interval: Time.Common,
        eventProfile: profile.mediaFastFeed,
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
    eventProfile: profile.mediaFastFeed,
    sub: {
      telegraph: {
        title: "电报",
        interval: Time.UltraFast,
        type: "realtime",
        eventProfile: profile.mediaFastFeed,
      },
      depth: {
        title: "深度",
        eventProfile: profile.mediaFastFeed,
      },
      hot: {
        title: "热门",
        type: "hottest",
        eventProfile: profile.mediaFastFeed,
      },
    },
  },
  "xueqiu": {
    name: "雪球",
    color: "blue",
    home: "https://xueqiu.com",
    column: "finance",
    eventProfile: profile.marketMoveFeed,
    sub: {
      hotstock: {
        title: "热门股票",
        interval: Time.Realtime,
        type: "hottest",
        eventProfile: profile.marketMoveFeed,
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
    eventProfile: profile.mediaFastFeed,
  },
  "fastbull": {
    name: "法布财经",
    color: "emerald",
    home: "https://www.fastbull.cn",
    column: "finance",
    eventProfile: profile.mediaFastFeed,
    sub: {
      express: {
        title: "快讯",
        type: "realtime",
        interval: Time.UltraFast,
        eventProfile: profile.mediaFastFeed,
      },
      news: {
        title: "头条",
        interval: Time.Common,
        eventProfile: profile.mediaFastFeed,
      },
    },
  },
  "eastmoney": {
    name: "东方财富",
    color: "orange",
    column: "finance",
    home: "https://kuaixun.eastmoney.com/",
    eventProfile: profile.mediaFastFeed,
    sub: {
      "7x24": {
        title: "7x24",
        type: "realtime",
        interval: Time.UltraFast,
        eventProfile: profile.mediaFastFeed,
      },
    },
  },
  "sina": {
    name: "新浪财经",
    color: "red",
    column: "finance",
    home: "https://finance.sina.com.cn/7x24/",
    eventProfile: profile.mediaFastFeed,
    sub: {
      "7x24": {
        title: "7x24",
        type: "realtime",
        interval: Time.UltraFast,
        eventProfile: profile.mediaFastFeed,
      },
    },
  },
  "chinamoney": {
    name: "中国货币网",
    color: "sky",
    column: "finance",
    home: "https://www.chinamoney.com.cn/chinese/bkshibor/",
    sub: {
      shibor: {
        title: "Shibor",
        interval: Time.Fast,
        home: "https://www.chinamoney.com.cn/chinese/bkshibor/",
        eventProfile: profile.officialRateFixing,
      },
      fdr007: {
        title: "FDR007",
        desc: "官方银银间7天回购定盘利率，基于DR007交易样本编制",
        interval: Time.Fast,
        home: "https://www.chinamoney.com.cn/chinese/bkfrr/",
        eventProfile: profile.officialRateFixing,
      },
      fr007: {
        title: "FR007",
        desc: "官方7天回购定盘利率",
        interval: Time.Fast,
        home: "https://www.chinamoney.com.cn/chinese/bkfrr/",
        eventProfile: profile.officialRateFixing,
      },
      lpr: {
        title: "LPR",
        desc: "官方贷款市场报价利率",
        interval: Time.Common,
        home: "https://www.chinamoney.com.cn/chinese/bklpr/",
        eventProfile: profile.officialRateFixing,
      },
    },
  },
  "pbc": {
    name: "人民银行",
    color: "amber",
    column: "finance",
    home: "https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      news: {
        title: "新闻发布",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
      },
      omo: {
        title: "公开市场操作",
        interval: Time.Fast,
        home: "https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html",
        eventProfile: profile.officialCentralBankOperation,
      },
      mlf: {
        title: "MLF",
        interval: Time.Default,
        home: "https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125437/125446/125873/index.html",
        eventProfile: profile.officialCentralBankOperation,
      },
    },
  },
  "safe": {
    name: "外汇局",
    color: "cyan",
    column: "finance",
    home: "https://www.safe.gov.cn/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      latest: {
        title: "外汇动态",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "csrc": {
    name: "证监会",
    color: "amber",
    column: "finance",
    home: "https://www.csrc.gov.cn",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      policy: {
        title: "政策解读",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
      },
      press: {
        title: "新闻发布会",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
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
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
        },
      },
      results: {
        title: "业绩公告",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
          defaultEventSubType: "earnings",
        },
      },
      halt: {
        title: "停复牌",
        interval: Time.UltraFast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
          defaultEventSubType: "listing_status",
        },
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
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["A"],
        },
      },
    },
  },
  "szse": {
    name: "深交所",
    color: "sky",
    column: "finance",
    home: "https://www.szse.cn/index/index.html",
    eventProfile: {
      ...profile.officialPolicyNotice,
      markets: ["A"],
    },
    sub: {
      news: {
        title: "交易所要闻",
        interval: Time.Default,
        eventProfile: {
          ...profile.officialPolicyNotice,
          markets: ["A"],
        },
      },
    },
  },
  "cninfo": {
    name: "巨潮资讯",
    color: "indigo",
    column: "finance",
    home: "https://www.cninfo.com.cn",
    sub: {
      "szse": {
        title: "深市公告",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["A"],
        },
      },
      "sse": {
        title: "沪市公告",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["A"],
        },
      },
      "hk-main": {
        title: "港主板公告",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
        },
      },
      "hk-gem": {
        title: "港创业板公告",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
        },
      },
      "hk-disclosure": {
        title: "港股股本变动",
        interval: Time.Fast,
        eventProfile: {
          ...profile.exchangeDisclosure,
          markets: ["HK"],
          defaultEventSubType: "shareholding_change",
        },
      },
    },
  },
  "miit": {
    name: "工信部",
    color: "sky",
    column: "industry",
    home: "https://www.miit.gov.cn/xwdt/gxdt/sjdt/index.html",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      industry: {
        title: "司局动态",
        interval: Time.Default,
        tags: [
          "manufacturing",
          "semiconductor",
          "photovoltaic",
          "new-energy-vehicle",
          "power-battery",
          "ai-computing",
          "cloud-infrastructure",
          "communication-equipment",
          "robotics",
          "steel",
          "non-ferrous",
          "chemical",
        ],
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "ndrc": {
    name: "发改委",
    color: "emerald",
    column: "industry",
    home: "https://www.ndrc.gov.cn/xwdt/dt/sjdt/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      industry: {
        title: "司局动态",
        interval: Time.Default,
        tags: [
          "manufacturing",
          "semiconductor",
          "photovoltaic",
          "new-energy-vehicle",
          "power-battery",
          "medicine",
          "ai-computing",
          "cloud-infrastructure",
          "communication-equipment",
          "robotics",
          "steel",
          "non-ferrous",
          "chemical",
        ],
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "stats": {
    name: "统计局",
    color: "teal",
    column: "industry",
    home: "https://www.stats.gov.cn/sj/zxfb/",
    eventProfile: profile.officialMacroRelease,
    sub: {
      industry: {
        title: "数据发布",
        interval: Time.Common,
        tags: allIndustryTags,
        eventProfile: profile.officialMacroRelease,
      },
    },
  },
  "nea": {
    name: "国家能源局",
    color: "amber",
    column: "industry",
    home: "https://www.nea.gov.cn/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      release: {
        title: "新闻发布",
        interval: Time.Default,
        tags: ["photovoltaic", "new-energy-vehicle"],
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "nhsa": {
    name: "国家医保局",
    color: "cyan",
    column: "industry",
    home: "https://www.nhsa.gov.cn/col/col14/index.html",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      dynamic: {
        title: "医保动态",
        interval: Time.Default,
        tags: ["medicine"],
        eventProfile: profile.officialPolicyNotice,
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
        eventProfile: profile.industryStatRelease,
      },
      analysis: {
        title: "行业分析",
        interval: Time.Common,
        tags: ["steel"],
        eventProfile: profile.industryNewsFeed,
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
        eventProfile: profile.industryPolicyNotice,
      },
      news: {
        title: "行业动态",
        interval: Time.Common,
        home: "https://www.chinapv.org.cn/",
        tags: ["photovoltaic"],
        eventProfile: profile.industryNewsFeed,
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
        eventProfile: profile.industryStatRelease,
      },
      policy: {
        title: "政策法规",
        interval: Time.Common,
        tags: ["non-ferrous"],
        eventProfile: profile.industryPolicyNotice,
      },
      news: {
        title: "行业新闻",
        interval: Time.Common,
        tags: ["non-ferrous"],
        eventProfile: profile.industryNewsFeed,
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
        eventProfile: profile.industryNewsFeed,
      },
      data: {
        title: "SEMI数据",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing"],
        eventProfile: profile.industryStatRelease,
      },
    },
  },
  "gartner": {
    name: "Gartner",
    disable: true,
    color: "indigo",
    column: "industry",
    home: "https://www.gartner.com/en/newsroom",
    sub: {
      newsroom: {
        title: "Newsroom",
        disable: true,
        desc: "Deferred: live source smoke returned 403 on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "omdia": {
    name: "Omdia",
    disable: true,
    color: "sky",
    column: "industry",
    home: "https://omdia.tech.informa.com/pr",
    sub: {
      "semiconductor": {
        title: "半导体研究",
        disable: true,
        desc: "Deferred: live source smoke returned 403 on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing"],
        eventProfile: profile.industryReportRelease,
      },
      "cloud-infrastructure": {
        title: "云基础设施",
        disable: true,
        desc: "Deferred: live source smoke returned 403 on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
      "optical-communications": {
        title: "光通信/通信设备",
        disable: true,
        desc: "Deferred: live source smoke returned 403 on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["communication-equipment", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "trendforce": {
    name: "TrendForce",
    color: "blue",
    column: "industry",
    home: "https://www.trendforce.com/news",
    sub: {
      semiconductor: {
        title: "Semiconductors",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "openai": {
    name: "OpenAI",
    color: "green",
    column: "industry",
    home: "https://openai.com/news/",
    sub: {
      news: {
        title: "News",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "anthropic": {
    name: "Anthropic",
    disable: true,
    color: "slate",
    column: "industry",
    home: "https://www.anthropic.com/news",
    sub: {
      news: {
        title: "Newsroom",
        disable: true,
        desc: "Deferred: live source smoke timed out on 2026-06-11; needs RSS/API replacement or source-specific adapter.",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "google-ai": {
    name: "Google AI",
    color: "blue",
    column: "industry",
    home: "https://blog.google/innovation-and-ai/technology/ai/",
    sub: {
      news: {
        title: "AI updates",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "google-deepmind": {
    name: "Google DeepMind",
    color: "cyan",
    column: "industry",
    home: "https://deepmind.google/blog/",
    sub: {
      news: {
        title: "News",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "meta-ai": {
    name: "Meta AI",
    disable: true,
    color: "indigo",
    column: "industry",
    home: "https://ai.meta.com/blog/",
    sub: {
      news: {
        title: "Blog",
        disable: true,
        desc: "Deferred: live source smoke timed out on 2026-06-11 and page extraction included navigation labels; needs RSS/API replacement or source-specific adapter.",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "microsoft-ai": {
    name: "Microsoft AI",
    color: "sky",
    column: "industry",
    home: "https://news.microsoft.com/source/topics/ai/",
    sub: {
      news: {
        title: "AI",
        interval: Time.Fast,
        tags: ["ai-computing"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "aws-ai": {
    name: "AWS AI",
    color: "orange",
    column: "industry",
    home: "https://aws.amazon.com/blogs/machine-learning/",
    sub: {
      news: {
        title: "Machine Learning Blog",
        interval: Time.Fast,
        tags: ["ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "nvidia": {
    name: "NVIDIA",
    color: "green",
    column: "industry",
    home: "https://nvidianews.nvidia.com/rss",
    sub: {
      "ai-news": {
        title: "AI Newsroom",
        interval: Time.Fast,
        tags: ["semiconductor", "ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "amd": {
    name: "AMD",
    color: "red",
    column: "industry",
    home: "https://ir.amd.com/news-events/press-releases",
    sub: {
      "ai-press": {
        title: "AI Press Releases",
        interval: Time.Fast,
        tags: ["semiconductor", "ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "intel": {
    name: "Intel",
    color: "blue",
    column: "industry",
    home: "https://www.intc.com/news-events/press-releases",
    sub: {
      "ai-press": {
        title: "AI Press Releases",
        interval: Time.Fast,
        tags: ["semiconductor", "ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "broadcom": {
    name: "Broadcom",
    color: "orange",
    column: "industry",
    home: "https://news.broadcom.com/releases",
    sub: {
      "ai-news": {
        title: "AI News",
        interval: Time.Fast,
        tags: ["semiconductor", "ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "tsmc": {
    name: "TSMC",
    disable: true,
    color: "emerald",
    column: "industry",
    home: "https://pr.tsmc.com/english/latest-news",
    sub: {
      latest: {
        title: "Latest News",
        disable: true,
        desc: "Deferred: live source smoke returned Cloudflare/403 on 2026-06-11; needs alternate RSS/API or source-specific adapter.",
        interval: Time.Fast,
        tags: ["semiconductor"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "asml": {
    name: "ASML",
    color: "cyan",
    column: "industry",
    home: "https://www.asml.com/news/press-releases",
    sub: {
      press: {
        title: "Press Releases",
        interval: Time.Fast,
        tags: ["semiconductor"],
        eventProfile: profile.industryNewsFeed,
      },
    },
  },
  "techinsights": {
    name: "TechInsights",
    disable: true,
    color: "slate",
    column: "industry",
    home: "https://www.techinsights.com/technical-capabilities/overview/markets-served/semiconductors",
    sub: {
      semiconductor: {
        title: "半导体洞察",
        disable: true,
        desc: "Deferred: live source smoke timed out on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["semiconductor", "ai-computing"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "yole": {
    name: "Yole Group",
    disable: true,
    color: "violet",
    column: "industry",
    home: "https://www.yolegroup.com/press-releases/",
    sub: {
      semiconductor: {
        title: "Semiconductor",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["semiconductor"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "wsts": {
    name: "WSTS",
    color: "cyan",
    column: "industry",
    home: "https://www.wsts.org/",
    sub: {
      press: {
        title: "市场统计",
        interval: Time.Common,
        tags: ["semiconductor"],
        eventProfile: profile.industryStatRelease,
      },
    },
  },
  "idc": {
    name: "IDC",
    color: "blue",
    column: "industry",
    home: "https://www.idc.com/about/press",
    sub: {
      "cloud-infrastructure": {
        title: "云/服务器基础设施",
        interval: Time.Common,
        tags: ["ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "canalys": {
    name: "Canalys",
    disable: true,
    color: "emerald",
    column: "industry",
    home: "https://www.canalys.com/newsroom",
    sub: {
      "cloud-infrastructure": {
        title: "云基础设施",
        disable: true,
        desc: "Deferred: live source smoke returned 403 on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["ai-computing", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "lightcounting": {
    name: "LightCounting",
    disable: true,
    color: "orange",
    column: "industry",
    home: "https://www.lightcounting.com/newsletter",
    sub: {
      newsletter: {
        title: "光模块市场",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["communication-equipment", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "delloro": {
    name: "Dell'Oro",
    disable: true,
    color: "amber",
    column: "industry",
    home: "https://www.delloro.com/news/",
    sub: {
      telecom: {
        title: "通信设备市场",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02 after navigation filtering; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["communication-equipment", "cloud-infrastructure"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "cignal-ai": {
    name: "Cignal AI",
    disable: true,
    color: "purple",
    column: "industry",
    home: "https://www.cignal.ai/news/",
    sub: {
      optical: {
        title: "Optical/Telecom",
        disable: true,
        desc: "Deferred: live source smoke timed out on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["communication-equipment"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "sne-research": {
    name: "SNE Research",
    color: "rose",
    column: "industry",
    home: "https://sneresearch.com/en/insight/release/",
    sub: {
      battery: {
        title: "动力电池",
        interval: Time.Common,
        tags: ["power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryStatRelease,
      },
    },
  },
  "cabia": {
    name: "中国汽车动力电池产业创新联盟",
    disable: true,
    color: "red",
    column: "industry",
    home: "https://batteryalliancechina.org/about",
    sub: {
      battery: {
        title: "动力电池月度信息",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryStatRelease,
      },
    },
  },
  "ggii": {
    name: "GGII/高工产业研究院",
    disable: true,
    color: "lime",
    column: "industry",
    home: "https://www.gg-ii.com/",
    sub: {
      battery: {
        title: "动力电池",
        disable: true,
        desc: "Deferred: live source smoke failed to fetch on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryReportRelease,
      },
      robotics: {
        title: "机器人/工控",
        disable: true,
        desc: "Deferred: live source smoke failed to fetch on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["robotics", "manufacturing"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "evtank": {
    name: "EVTank",
    color: "green",
    column: "industry",
    home: "http://www.evtank.cn/",
    sub: {
      battery: {
        title: "动力电池研究",
        interval: Time.Common,
        tags: ["power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "infolink": {
    name: "InfoLink",
    color: "sky",
    column: "industry",
    home: "https://www.infolink-group.com/energy-article",
    sub: {
      solar: {
        title: "光伏供应链",
        interval: Time.Common,
        tags: ["photovoltaic"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "woodmac": {
    name: "Wood Mackenzie",
    disable: true,
    color: "orange",
    column: "industry",
    home: "https://www.woodmac.com/news/",
    sub: {
      renewables: {
        title: "新能源/光伏",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02 after navigation filtering; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["photovoltaic", "power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "bnef": {
    name: "BloombergNEF",
    disable: true,
    color: "green",
    column: "industry",
    home: "https://about.bnef.com/insights/",
    sub: {
      "energy-transition": {
        title: "能源转型",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02 after navigation filtering; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["photovoltaic", "power-battery", "new-energy-vehicle"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "ifr": {
    name: "IFR",
    color: "blue",
    column: "industry",
    home: "https://ifr.org/ifr-press-releases/",
    sub: {
      robotics: {
        title: "机器人统计",
        interval: Time.Common,
        tags: ["robotics", "manufacturing"],
        eventProfile: profile.industryStatRelease,
      },
    },
  },
  "mir": {
    name: "MIR睿工业",
    disable: true,
    color: "violet",
    column: "industry",
    home: "https://www.mirdatabank.com/news",
    sub: {
      automation: {
        title: "工业自动化",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["robotics", "manufacturing"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "customs": {
    name: "海关总署",
    disable: true,
    color: "cyan",
    column: "industry",
    home: "https://english.customs.gov.cn/Statistics/Statistics?ColumnId=1",
    sub: {
      manufacturing: {
        title: "进出口统计",
        disable: true,
        desc: "Deferred: live source smoke failed to fetch on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["manufacturing", "semiconductor", "photovoltaic", "power-battery", "communication-equipment"],
        eventProfile: profile.officialMacroRelease,
      },
    },
  },
  "ccid": {
    name: "赛迪顾问",
    disable: true,
    color: "indigo",
    column: "industry",
    home: "https://www.ccidconsulting.com/en/",
    sub: {
      consulting: {
        title: "制造业研究",
        disable: true,
        desc: "Deferred: live source smoke returned empty results on 2026-05-02; needs source-specific adapter or alternate feed.",
        interval: Time.Common,
        tags: ["manufacturing", "semiconductor", "ai-computing", "cloud-infrastructure", "robotics"],
        eventProfile: profile.industryReportRelease,
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
        eventProfile: profile.industryNewsFeed,
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
        eventProfile: profile.industryStatRelease,
      },
      "nev-policy": {
        title: "新能源汽车政策",
        interval: Time.Common,
        tags: ["new-energy-vehicle"],
        eventProfile: profile.industryPolicyNotice,
      },
      "nev-news": {
        title: "新能源汽车行业新闻",
        interval: Time.Default,
        tags: ["new-energy-vehicle"],
        eventProfile: profile.industryNewsFeed,
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
        eventProfile: profile.officialPolicyNotice,
      },
      policy: {
        title: "法律法规",
        interval: Time.Common,
        tags: ["medicine"],
        eventProfile: profile.officialPolicyNotice,
      },
      rules: {
        title: "中心制度",
        interval: Time.Common,
        tags: ["medicine"],
        eventProfile: profile.officialPolicyNotice,
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
        eventProfile: profile.industryNewsFeed,
      },
      "ai-reports": {
        title: "算力/AI报告",
        interval: Time.Common,
        tags: ["ai-computing"],
        eventProfile: profile.industryReportRelease,
      },
      "reports": {
        title: "产业报告",
        interval: Time.Common,
        tags: ["manufacturing", "ai-computing", "cloud-infrastructure", "communication-equipment"],
        eventProfile: profile.industryReportRelease,
      },
    },
  },
  "gov": {
    name: "中国政府网",
    color: "red",
    column: "industry",
    home: "https://www.gov.cn/yaowen/liebiao/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      latest: {
        title: "国务院要闻",
        interval: Time.Common,
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "sasac": {
    name: "国资委",
    color: "slate",
    column: "industry",
    home: "http://www.sasac.gov.cn/n2588025/n2588119/index.html",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      latest: {
        title: "国资动态",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "mof": {
    name: "财政部",
    color: "emerald",
    column: "industry",
    home: "https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      news: {
        title: "财政新闻",
        interval: Time.Common,
        eventProfile: profile.officialPolicyNotice,
      },
    },
  },
  "mofcom": {
    name: "商务部",
    color: "blue",
    column: "industry",
    home: "https://www.mofcom.gov.cn/",
    eventProfile: profile.officialPolicyNotice,
    sub: {
      release: {
        title: "日常新闻发布",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
      },
      spokesperson: {
        title: "发言人谈话",
        interval: Time.Default,
        eventProfile: profile.officialPolicyNotice,
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
    eventProfile: profile.mediaFastFeed,
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
      eventProfile: source.eventProfile,
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

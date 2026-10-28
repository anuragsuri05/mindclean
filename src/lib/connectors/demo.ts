import "server-only";
import type { ContentCategory, MediaKind, Platform } from "../types";
import type { Connector, RawItem } from "./types";

/**
 * Deterministic demo feeds for platforms without an official feed API.
 * Content is realistic but entirely synthetic. Each item carries a category
 * hint, so the habit engine and insights work even without Claude.
 */

interface DemoCreds {
  platform: Platform;
  seed: string;
}

type Template = [ContentCategory, string, string, string?];

const LIBRARY: Partial<Record<Platform, { kind: MediaKind | "text"; authors: string[]; posts: Template[] }>> = {
  instagram: {
    kind: "reel",
    authors: ["dailyvibes", "memequeen.co", "streetfoodking", "glowup.diaries", "travelwithmira", "gymbrostories", "petsofinsta", "luxurylife.mood", "dance.trend.hub", "chef.marco"],
    posts: [
      ["entertainment", "😂", "POV: you said 'just one more reel' 45 minutes ago"],
      ["entertainment", "💃", "New dance trend 🔥 tag someone who can do this #trend #viral"],
      ["entertainment", "🍔", "Trying the viral 7-layer burger in Bangkok 🤯 worth it??"],
      ["social", "✨", "Get ready with me for my cousin's wedding 💄 outfit reveal at the end"],
      ["entertainment", "🐶", "He heard the treat bag from three rooms away 😭"],
      ["entertainment", "🏎️", "Day in the life of a 22 y/o millionaire (not clickbait)"],
      ["wellbeing", "🧘", "5-minute morning stretch that fixed my back pain"],
      ["entertainment", "🎤", "Celebrity spotted at the airport — guess who 👀"],
      ["creative", "🎨", "Painting the sunset with only 3 colours, satisfying process"],
      ["entertainment", "😱", "Wait for it… the plot twist at 0:12 😳"],
      ["social", "🌴", "Bali sunsets hit different 🌅 swipe for the villa tour"],
      ["educational", "💡", "3 Excel tricks nobody taught you in school"],
      ["entertainment", "🛒", "Things I bought from Amazon that just make sense #amazonfinds"],
      ["entertainment", "😴", "Me pretending to work when my manager walks by 💀"],
    ],
  },
  tiktok: {
    kind: "reel",
    authors: ["@chaoticcarl", "@lifehacklena", "@fyp.queen", "@unboxwithraj", "@prankcentral", "@cookingwithnana", "@study.with.kai"],
    posts: [
      ["entertainment", "🤣", "Telling my mom I failed my exam as a prank #fyp"],
      ["entertainment", "📦", "Unboxing a $5 mystery box from a vending machine 😳"],
      ["educational", "🧠", "The psychology trick that makes people remember your name"],
      ["entertainment", "🎵", "This sound is stuck in my head forever now"],
      ["entertainment", "🫠", "Rating every gas station snack in America part 47"],
      ["wellbeing", "🥗", "What I eat in a day as a nurse on night shift"],
      ["educational", "📚", "Study with me: 2-hour pomodoro, lofi beats"],
      ["entertainment", "🧃", "Storytime: my roommate ate my labelled food AGAIN"],
      ["entertainment", "🎮", "This game glitch broke the internet 😂"],
      ["creative", "🎬", "How I shot this with just my phone and a lamp"],
    ],
  },
  linkedin: {
    kind: "text",
    authors: ["Priya Raman · Product Lead at Fintech", "Daniel Okafor · Staff Engineer", "Sofia Martins · Founder & CEO", "Arjun Mehta · Data Scientist", "Grace Liu · VP Talent", "Marcus Webb · Growth Marketer", "Aisha Khan · AI Researcher"],
    posts: [
      ["career", "📈", "I've interviewed 300+ PMs. The best answers to 'tell me about a failure' have one thing in common: they name the decision, not the outcome. Here's the framework I use ↓"],
      ["educational", "🤖", "A practical guide to evaluating LLM features before you ship them: 1) build a 50-example golden set, 2) grade with a rubric, 3) track regressions per release. Thread on what we learned."],
      ["career", "💼", "Negotiation tip most people miss: ask 'what would make this offer a yes for you?' before you counter. It changes the conversation from price to value."],
      ["educational", "📊", "SQL window functions explained with one example you'll actually remember (running totals of daily sales)."],
      ["career", "🌱", "Two years ago I was laid off. Today I lead a team of 12. What actually helped: one hour a day of deliberate learning, and writing in public about it."],
      ["news", "🗞️", "EU AI Act obligations for general-purpose models start applying next quarter. A plain-English summary of what changes for product teams."],
      ["educational", "🧩", "System design interview: how I'd design a rate limiter. Token bucket vs sliding window, with trade-offs."],
      ["career", "🎯", "Your résumé isn't a job description. Replace 'responsible for' with 'reduced / grew / shipped' plus a number. Before/after example inside."],
      ["educational", "🔐", "Security basics every developer should know: why you should never roll your own crypto, and what to use instead."],
      ["career", "🤝", "The highest-leverage habit of great managers I've worked with: a weekly 15-minute 'what's blocking you' note to each report."],
      ["news", "💡", "Our team cut cloud costs 38% without touching performance. Here's the exact checklist we used."],
      ["educational", "📝", "How to write a one-page design doc that actually gets read (template in comments)."],
    ],
  },
  threads: {
    kind: "text",
    authors: ["@kaya.writes", "@techwithtom", "@mindful.ana", "@hotTakesHank", "@bookish.ben"],
    posts: [
      ["social", "💬", "unpopular opinion: brunch is just breakfast with a waiting list"],
      ["educational", "📖", "Finished 'Thinking in Systems' — the idea of stocks and flows changed how I see my own habits."],
      ["entertainment", "🔥", "the group chat after someone sends a voice note longer than 2 minutes 💀"],
      ["news", "🛰️", "The new space telescope images dropped and they're unreal. Thread of my favourites."],
      ["wellbeing", "🌿", "Reminder: rest is productive. Close the app, drink some water."],
      ["career", "🧑‍💻", "What's one skill that 10x'd your career? Mine was learning to write clearly."],
    ],
  },
  x: {
    kind: "text",
    authors: ["@breakingnow", "@devhumor", "@econ_explained", "@ratiomaster", "@ml_papers"],
    posts: [
      ["news", "🚨", "BREAKING: Markets react to surprise rate decision. Here's what it means for you 🧵"],
      ["entertainment", "😂", "programmers when the code works on the first try: suspicious"],
      ["educational", "📉", "Inflation explained in 5 charts (no jargon)"],
      ["entertainment", "🍿", "This reply section is the best thing on the internet today"],
      ["educational", "🧪", "New paper: smaller models trained on curated data beat models 10x their size. Key takeaways ↓"],
      ["social", "🗳️", "Hot take poll: tabs or spaces?"],
    ],
  },
  facebook: {
    kind: "image",
    authors: ["Mom", "Neighbourhood Watch Group", "Uncle Ravi", "Daily Laughs Page", "Local Farmers Market"],
    posts: [
      ["social", "🎂", "Happy birthday to my amazing sister! Throwback to 2009 🥰"],
      ["entertainment", "🤣", "Share if you remember this from the 90s!!"],
      ["social", "🏡", "Has anyone else's power gone out on Maple Street?"],
      ["news", "🥕", "This Saturday: free cooking workshop at the market, 10am"],
      ["entertainment", "📸", "Only geniuses can find the hidden cat in this picture 🐱"],
    ],
  },
  pinterest: {
    kind: "image",
    authors: ["Cozy Home Ideas", "Minimal Desk Setups", "Healthy Meal Prep", "Outfit Inspo", "DIY Weekend"],
    posts: [
      ["creative", "🪴", "Small balcony garden ideas for apartments"],
      ["wellbeing", "🥙", "15 high-protein lunches you can prep on Sunday"],
      ["creative", "🖥️", "Minimal desk setup with warm lighting"],
      ["entertainment", "👗", "Autumn capsule wardrobe: 20 pieces, 50 outfits"],
      ["creative", "🧶", "Beginner-friendly crochet patterns"],
      ["educational", "🗂️", "Bullet journal layouts for tracking habits"],
    ],
  },
  snapchat: {
    kind: "reel",
    authors: ["Spotlight · @zoe", "Spotlight · @funnyfails", "Discover · Daily Gossip", "Spotlight · @skaterjay"],
    posts: [
      ["entertainment", "🛹", "Landed it on the 47th try 😤"],
      ["entertainment", "👻", "Celebrity breakup rumours: what we know"],
      ["entertainment", "🙈", "Epic fail compilation of the week"],
      ["social", "🎉", "Party recap from last night 🎶"],
      ["entertainment", "🐱", "Cat vs cucumber, round 2"],
    ],
  },
  inshorts: {
    kind: "image",
    authors: ["Inshorts · Business", "Inshorts · Technology", "Inshorts · India", "Inshorts · World", "Inshorts · Startups"],
    posts: [
      ["news", "🏦", "RBI keeps repo rate unchanged at 5.5% for the third straight meeting, citing easing inflation and steady growth. The central bank raised its FY27 GDP forecast to 7.1% and said food prices remain the key risk to watch."],
      ["news", "🚀", "ISRO successfully tests the crew escape system for Gaganyaan ahead of India's first human spaceflight. The test validated the abort sequence at high altitude, a critical milestone before the crewed mission next year."],
      ["news", "🤖", "Indian IT majors announce large AI upskilling programmes for over 2 lakh employees. Companies say demand for generative AI projects from global clients doubled this year, especially in banking and retail."],
      ["news", "📉", "Sensex closes 600 points lower as global markets slip on US bond yield concerns. Banking and IT stocks led the fall while pharma gained; analysts expect volatility to continue through the earnings season."],
      ["news", "🌏", "World leaders agree on a new climate finance framework at the UN summit, pledging $300 billion a year for developing nations by 2035. Activists called it a step forward but said it falls short of what is needed."],
      ["news", "💡", "A Bengaluru startup raises $40 million to build affordable EV batteries using sodium-ion technology. The company says its cells cost 30% less than lithium-ion and will power two-wheelers from next year."],
      ["news", "🎓", "UGC approves a framework allowing students to earn degrees through a mix of online and classroom credits. Universities can now offer up to 40% of a programme online under the new guidelines."],
      ["news", "📱", "UPI crosses 20 billion monthly transactions for the first time, NPCI data shows. Small-value payments under ₹500 now make up more than half of all UPI transfers, driven by street vendors and local shops."],
    ],
  },
  youtube: {
    kind: "reel",
    authors: ["MrViral", "Daily Shorts", "Prank Nation", "Kurzgesagt", "Ali Abdaal", "Veritasium"],
    posts: [
      ["entertainment", "😱", "I survived 24 hours in the world's smallest hotel room #shorts"],
      ["entertainment", "🤣", "Funniest fails of the week compilation #shorts"],
      ["educational", "🌌", "What if the Sun disappeared for one second? (12 min explainer)"],
      ["career", "📚", "How I'd learn any skill in 30 days: a practical system"],
      ["educational", "⚙️", "The engineering behind the world's longest bridge"],
      ["entertainment", "🍕", "Trying every pizza topping combination #shorts"],
    ],
  },
  reddit: {
    kind: "text",
    authors: ["r/technology", "r/personalfinance", "r/memes", "r/cscareerquestions", "r/science", "r/funny"],
    posts: [
      ["news", "💻", "New study finds remote workers are 13% more productive when given async-first communication norms"],
      ["career", "🧭", "After 3 years and 200 applications, I finally landed a data analyst role. Here's everything that worked (long post)"],
      ["entertainment", "😹", "My cat when I open a can of beans vs a can of tuna"],
      ["educational", "🔬", "Researchers develop a battery that charges in 5 minutes and lasts 20 years. ELI5 in comments"],
      ["educational", "💰", "Simple guide: emergency fund → employer match → high-interest debt → index funds"],
    ],
  },
  wechat: {
    kind: "text",
    authors: ["Channels · 科技前沿", "Moments · Li Wei", "Official Account · 每日财经", "Channels · 美食日记"],
    posts: [
      ["news", "📰", "Morning briefing: 5 business stories to know today"],
      ["social", "🍜", "Weekend hotpot with the team 🥳"],
      ["educational", "📱", "A 3-minute explainer on how mini-programs work"],
      ["entertainment", "🎤", "Variety show highlights from last night"],
      ["educational", "💹", "Personal finance tip: the 50/30/20 budget rule"],
    ],
  },
};

const GRADIENTS: Record<ContentCategory, string> = {
  entertainment: "linear-gradient(135deg,#f97316,#ec4899)",
  social: "linear-gradient(135deg,#f59e0b,#ef4444)",
  educational: "linear-gradient(135deg,#0ea5e9,#6366f1)",
  career: "linear-gradient(135deg,#0a66c2,#14b8a6)",
  news: "linear-gradient(135deg,#64748b,#0f172a)",
  creative: "linear-gradient(135deg,#a855f7,#f472b6)",
  wellbeing: "linear-gradient(135deg,#22c55e,#14b8a6)",
  other: "linear-gradient(135deg,#94a3b8,#475569)",
};

const PAGE = 20;
const MAX_ITEMS = 300;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeItem(creds: DemoCreds, index: number): RawItem {
  const lib = LIBRARY[creds.platform] ?? LIBRARY.threads!;
  const h = hash(`${creds.seed}:${index}`);
  const [category, emoji, text] = lib.posts[(h + index) % lib.posts.length];
  const author = lib.authors[(h >>> 8) % lib.authors.length];
  const [name, subtitle] = author.split(" · ");
  const createdAt = new Date(Date.now() - (index * 23 + (h % 17)) * 60_000).toISOString();
  return {
    platform: creds.platform,
    externalId: `demo-${creds.seed}-${index}`,
    authorName: name,
    authorHandle: subtitle,
    text,
    url: undefined,
    media:
      lib.kind === "text"
        ? []
        : [{ kind: lib.kind, gradient: GRADIENTS[category], emoji, aspect: lib.kind === "reel" ? "portrait" : "square" }],
    createdAt,
    categoryHint: category,
  };
}

export const demo: Connector<DemoCreds> = {
  async fetchPage(creds, cursor) {
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + PAGE, MAX_ITEMS);
    const items = Array.from({ length: end - start }, (_, i) => makeItem(creds, start + i));
    return { items, nextCursor: end < MAX_ITEMS ? String(end) : null };
  },
};

export const demoProfile = (platform: Platform) => {
  const names: Partial<Record<Platform, string>> = {
    instagram: "@you · Instagram",
    tiktok: "@you · TikTok",
    linkedin: "You · LinkedIn",
    threads: "@you · Threads",
    x: "@you · X",
    facebook: "You · Facebook",
    pinterest: "You · Pinterest",
    snapchat: "you · Snapchat",
    wechat: "You · WeChat",
    inshorts: "Inshorts · Top news",
    youtube: "You · YouTube",
    reddit: "You · Reddit",
  };
  return { displayName: names[platform] ?? platform, handle: "demo", avatarUrl: null };
};

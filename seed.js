'use strict';

/**
 * 首次运行时写入示例条目（均标记 is_demo = 1，可在后台“设置”中一键清空）。
 * 正式使用前请用自己的档案替换。
 */

const fs = require('node:fs');
const path = require('node:path');
const store = require('./db');

const { db, UPLOAD_DIR } = store;
const COVER_DIR = path.join(__dirname, 'public', 'assets', 'covers');
fs.mkdirSync(COVER_DIR, { recursive: true });

function coverSvg(index, category, code, palette) {
  const seed = index * 37;
  const lines = [];
  for (let i = 0; i < 7; i += 1) {
    const y = 190 + i * 46 + ((seed * (i + 3)) % 27);
    const x1 = 70 + ((seed * (i + 5)) % 90);
    const x2 = 470 - ((seed * (i + 2)) % 120);
    lines.push(
      `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${palette.ink}" stroke-opacity="0.35" stroke-width="1"/>`
    );
  }
  const circles = [];
  for (let i = 0; i < 3; i += 1) {
    const cx = 150 + ((seed * (i + 2)) % 300);
    const cy = 250 + ((seed * (i + 4)) % 260);
    circles.push(
      `<circle cx="${cx}" cy="${cy}" r="${28 + ((seed * (i + 1)) % 46)}" fill="none" stroke="${
        i === 0 ? palette.accent : palette.ink
      }" stroke-opacity="${i === 0 ? 0.55 : 0.25}" stroke-width="1"/>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="${palette.bg}"/>
  <rect x="26" y="26" width="548" height="748" fill="none" stroke="${palette.ink}" stroke-opacity="0.18"/>
  <g font-family="'Noto Serif SC', serif" fill="${palette.ink}">
    <text x="62" y="82" font-size="15" letter-spacing="4" fill-opacity="0.72">${category}</text>
    <text x="62" y="700" font-size="14" letter-spacing="2" fill-opacity="0.55">${code}</text>
    <text x="62" y="742" font-size="13" letter-spacing="1" fill-opacity="0.4">海南当代艺术文献 · 示例封面</text>
    <text x="538" y="82" font-size="13" text-anchor="end" fill-opacity="0.45">HNCA</text>
  </g>
  <g>${lines.join('')}${circles.join('')}</g>
  <rect x="452" y="712" width="26" height="26" fill="${palette.accent}" fill-opacity="0.85"/>
</svg>`;
}

const palettes = [
  { bg: '#EFE9DC', ink: '#1A1813', accent: '#9E3B27' },
  { bg: '#E7E3D8', ink: '#22201A', accent: '#7A6A3F' },
  { bg: '#EDE6DD', ink: '#1C1A16', accent: '#2F4A45' },
  { bg: '#E9E4D6', ink: '#1B1914', accent: '#8A4A32' }
];

function ensureCover(index, category, code) {
  const file = `cover-${String(index).padStart(2, '0')}.svg`;
  const target = path.join(COVER_DIR, file);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, coverSvg(index, category, code, palettes[index % palettes.length]), 'utf8');
  }
  return `/assets/covers/${file}`;
}

const artists = [
  {
    name: '陈少武',
    name_en: 'Chen Shaowu',
    birth_year: 1948,
    birthplace: '海南海口',
    region: '海口',
    medium: '油画、纸本',
    bio: '生于海口，长期以海岛风物与城市变迁为题进行油画与纸本创作，1990年代起参与海南多项当代艺术活动的组织与文献整理。',
    statement: '（示例条目）此处可替换为该艺术家的自述或访谈节选。',
    tags: ['油画', '海岛', '城市变迁']
  },
  {
    name: '林克武',
    name_en: 'Lin Kewu',
    birth_year: 1963,
    birthplace: '海南文昌',
    region: '文昌',
    medium: '装置、影像',
    bio: '以海洋材料与废弃渔具为媒介进行装置与影像创作，关注渔村生产方式的转型与记忆保存。',
    tags: ['装置', '影像', '海洋']
  },
  {
    name: '吴晓薇',
    name_en: 'Wu Xiaowei',
    birth_year: 1975,
    birthplace: '海南三亚',
    region: '三亚',
    medium: '绘画、摄影',
    bio: '创作围绕旅游开发下的海岸景观与身体经验展开，近年以系列摄影与文本并置的方式呈现。',
    tags: ['摄影', '海岸', '旅游开发']
  },
  {
    name: '符海平',
    name_en: 'Fu Haiping',
    birth_year: 1982,
    birthplace: '海南儋州',
    region: '儋州',
    medium: '行为、摄影',
    bio: '以行为和记录性摄影介入乡村日常，作品多与东坡文化、方言与地方仪式有关。',
    tags: ['行为', '方言', '乡村']
  },
  {
    name: '何嘉',
    name_en: 'He Jia',
    birth_year: 1989,
    birthplace: '海南海口',
    region: '海口',
    medium: '综合媒介',
    bio: '工作于海口与广州之间，使用声音、文本与现成品讨论岛屿的流动性，并参与独立空间的运营。',
    tags: ['声音', '文本', '独立空间']
  },
  {
    name: '郑麦',
    name_en: 'Zheng Mai',
    birth_year: 1957,
    birthplace: '海南琼海',
    region: '琼海',
    medium: '水墨、版画',
    bio: '以水墨与木刻记录热带植物与民间信仰图像，1980年代起在海南与广东多地展出。',
    tags: ['水墨', '版画', '植物']
  }
];

const exhibitions = [
  {
    title: '岛屿现场：海南青年艺术家联展',
    title_en: 'Island Site: Hainan Young Artists',
    venue: '海口群众艺术馆',
    city: '海口',
    start_date: '1996-11-08',
    end_date: '1996-11-20',
    curators: '（示例）策展人待考',
    organizer: '海南青年美术协会（示例）',
    intro: '（示例条目）1990年代海南较具规模的一次青年艺术家群展，展出绘画、装置与影像作品三十余件，展览图录为本库重点收藏对象。',
    tags: ['群展', '1990年代']
  },
  {
    title: '热带叙事：海南当代艺术观察',
    title_en: 'Tropical Narratives',
    venue: '海南省博物馆',
    city: '海口',
    start_date: '2008-03-15',
    end_date: '2008-04-20',
    curators: '（示例）学术主持待补',
    organizer: '海南省美术家协会（示例）',
    intro: '（示例条目）以“热带”为线索梳理海南当代艺术的地方性表达，附有研讨会对谈记录与作品图版。',
    tags: ['主题展', '热带']
  },
  {
    title: '潮间带：海岛影像计划',
    title_en: 'Intertidal: Island Moving Image',
    venue: '三亚当代艺术空间',
    city: '三亚',
    start_date: '2014-07-05',
    end_date: '2014-08-17',
    curators: '（示例）策展小组',
    organizer: '三亚当代艺术空间（示例）',
    intro: '（示例条目）以潮间带为隐喻，展出海岛影像作品十二部，并配套放映与工作坊。',
    tags: ['影像', '三亚']
  },
  {
    title: '椰林下的现代性：海南美术三十年',
    title_en: 'Modernity under the Coconut Grove',
    venue: '海南省美术馆',
    city: '海口',
    start_date: '2019-09-28',
    end_date: '2019-12-08',
    curators: '（示例）联合策展',
    organizer: '海南省美术馆（示例）',
    intro: '（示例条目）以文献与作品并置的方式回顾1989年以来的海南美术进程，是研究地方艺术史的重要展览。',
    tags: ['回顾展', '文献展']
  },
  {
    title: '海口双年展·边缘的半径',
    title_en: 'Haikou Biennale: Radius of the Margin',
    venue: '海口骑楼老街',
    city: '海口',
    start_date: '2023-12-16',
    end_date: '2024-02-25',
    curators: '（示例）策展团队',
    organizer: '海口当代艺术中心（示例）',
    intro: '（示例条目）以骑楼街区为展场，探讨岛屿城市与外部世界的连接方式。',
    tags: ['双年展', '街区']
  }
];

const documents = [
  {
    title: '海南当代艺术活动文献索引（1988—2000）',
    category: '档案文件',
    author: '文献室整理',
    publisher: '海南当代艺术文献',
    pub_date: '2019-06',
    year: 2019,
    extent: '142 页',
    summary:
      '（示例条目）按年份编排的早期活动索引，收录展览、研讨、出版与空间开业等信息，附人名与机构索引。',
    content:
      '一、编例\n本索引以 1988 年为起点，收录海南省内举办的当代艺术展览、讲座、研讨与出版活动。每条著录时间、地点、参与人、材料出处，无法核实者以“待考”标注。\n\n二、使用说明\n引用时请使用本库档案编号；如发现错漏，欢迎通过“关于”页联系方式补充。\n\n（此段为示例正文，用于展示文献全文排版效果，可在后台替换。）',
    source: '文献室内部整理',
    rights: '仅限研究使用',
    tags: ['索引', '1988—2000', '编年'],
    artists: [0, 5],
    exhibitions: [0],
    cover: true
  },
  {
    title: '岛屿现场：海南青年艺术家联展 图录',
    category: '展览画册',
    author: '海南青年美术协会 编',
    publisher: '海南青年美术协会',
    pub_date: '1996-11',
    year: 1996,
    extent: '48 页；彩版 16',
    summary:
      '（示例条目）1996年群展图录，收录参展作品图版、艺术家简历与前言，是研究1990年代海南青年艺术生态的一手材料。',
    content:
      '前言（节选）\n\n（示例文本）当海岛被反复描述为边缘，边缘本身便成了一种位置。此次展览试图呈现的是位置之中的工作，而非关于位置的说明。\n\n参展艺术家（示例）：陈少武、郑麦、林克武等。',
    source: '私人收藏',
    rights: '版权归原出版方所有',
    tags: ['图录', '群展', '1996'],
    artists: [0, 1, 5],
    exhibitions: [0],
    cover: true
  },
  {
    title: '热带叙事：海南当代艺术观察（展览图册）',
    category: '展览画册',
    author: '海南省美术家协会 编',
    publisher: '海南出版社',
    pub_date: '2008-04',
    year: 2008,
    extent: '186 页',
    summary: '（示例条目）2008年主题展图册，含学术论文、作品图版与艺术家年表，附研讨会实录。',
    content: '（示例正文）图册分为“地景”“身体”“叙述”三个单元，每单元前附策展短文。',
    source: '机构赠阅',
    rights: '研究引用请注明出处',
    tags: ['图册', '热带', '研讨会'],
    artists: [1, 2, 5],
    exhibitions: [1],
    cover: true
  },
  {
    title: '椰林下的现代性：海南美术三十年 展览文献集',
    category: '展览画册',
    author: '海南省美术馆 编',
    publisher: '海南省美术馆',
    pub_date: '2019-09',
    year: 2019,
    extent: '320 页',
    summary: '（示例条目）回顾展配套文献集，以年表、作品、评论三重结构梳理1989年以来的海南美术。',
    content: '（示例正文）文献集收录 1989—2019 年间评论文章 26 篇，并首次公开部分展览请柬与海报原件扫描。',
    source: '海南省美术馆',
    rights: '版权归海南省美术馆所有',
    tags: ['回顾展', '年表', '文献集'],
    artists: [0, 2, 5],
    exhibitions: [3],
    cover: true
  },
  {
    title: '潮间带：海岛影像计划 放映手册',
    category: '影像资料',
    author: '三亚当代艺术空间 编',
    publisher: '三亚当代艺术空间',
    pub_date: '2014-07',
    year: 2014,
    extent: '36 页',
    summary: '（示例条目）影像展放映手册，含影片目录、导演陈述与放映排期，另附工作坊记录。',
    content: '（示例正文）影片目录共十二部，其中五部为海南本地作者作品。',
    source: '主办方提供',
    rights: '影片版权归各作者所有',
    tags: ['影像', '放映', '工作坊'],
    artists: [3, 4],
    exhibitions: [2],
    cover: true
  },
  {
    title: '海口骑楼老街展场手记',
    category: '艺术家手稿',
    author: '何嘉',
    pub_date: '2023-12',
    year: 2023,
    extent: '笔记本 1 册',
    summary: '（示例条目）艺术家在双年展布展期间的现场手记，记录展场考察、材料采购与街区访谈，共 42 页。',
    content: '（示例正文）12月3日，晴。骑楼的走廊把光切成一条一条，作品应该放在阴影里，让观众走近才看见。',
    source: '艺术家捐赠',
    rights: '手稿版权归艺术家所有',
    tags: ['手稿', '布展', '骑楼'],
    artists: [4],
    exhibitions: [4],
    cover: true
  },
  {
    title: '关于“地方”的几次谈话：海南艺术家访谈录',
    category: '访谈与口述',
    author: '文献室 访谈整理',
    pub_date: '2021-10',
    year: 2021,
    extent: '音频 4 小时；整理稿 68 页',
    summary:
      '（示例条目）对六位长期工作于海南的艺术家进行的口述访谈，围绕求学、展览机会、材料获取与地方认同展开。',
    content:
      '访谈节选（示例）\n\n问：你什么时候开始觉得“海南”是一个创作问题？\n答：其实一开始不是问题。后来外面的人来，总要先问一句“岛上怎么样”，它才变成问题。',
    source: '本项目访谈计划',
    rights: '经受访者授权，仅限研究',
    tags: ['口述史', '访谈', '地方性'],
    artists: [0, 1, 2, 3, 4, 5],
    exhibitions: [],
    cover: true
  },
  {
    title: '海口艺术空间变迁剪报汇编（2005—2022）',
    category: '期刊与剪报',
    author: '文献室 编',
    pub_date: '2022-08',
    year: 2022,
    extent: '剪报 216 张',
    summary: '（示例条目）收录本地报刊关于艺术空间、画廊与艺术区的报道与评论，按时间排列并标注出处。',
    content: '（示例正文）剪报原件存于档案盒 A-03 至 A-07，数字化扫描件正在整理中。',
    source: '本地报刊',
    rights: '版权归原刊所有',
    tags: ['剪报', '艺术空间', '报刊'],
    artists: [],
    exhibitions: [4],
    cover: true
  },
  {
    title: '椰林下的现代性——海南美术三十年（评论）',
    category: '艺术评论',
    author: '（示例）特约评论',
    publisher: '《南方美术》',
    pub_date: '2019-11',
    year: 2019,
    extent: '约 6800 字',
    summary: '（示例条目）围绕回顾展展开的评论文章，讨论“地方美术史”书写中的材料缺失与叙述策略问题。',
    content:
      '（示例正文）当一次回顾展试图以三十年为单位叙述地方，它首先要面对的不是作品，而是材料的散佚。',
    source: '期刊扫描',
    rights: '版权归原刊所有',
    tags: ['评论', '地方美术史'],
    artists: [0, 5],
    exhibitions: [3],
    cover: false
  },
  {
    title: '潮间带之后：海岛影像的两种时间',
    category: '艺术评论',
    author: '（示例）评论人',
    pub_date: '2015-01',
    year: 2015,
    extent: '约 4200 字',
    summary: '（示例条目）讨论海南影像创作中“潮汐时间”与“旅游时间”的并置，以2014年影像展为案例。',
    content: '（示例正文）潮汐的时间是往返的，旅游的时间是单向的。两者在同一片海岸上叠压。',
    source: '网络文章存档',
    rights: '作者授权转载',
    tags: ['评论', '影像', '时间'],
    artists: [3, 4],
    exhibitions: [2],
    cover: false
  },
  {
    title: '渔具与纪念碑：一次未实施的方案',
    category: '艺术家手稿',
    author: '林克武',
    pub_date: '2012-05',
    year: 2012,
    extent: '草图 12 张；说明文字 6 页',
    summary: '（示例条目）以废弃渔网与浮标构建临时纪念碑的方案草稿，含尺寸、材料清单与场地照片。',
    content: '（示例正文）方案拟于渔港退潮时实施，作品随下一次涨潮解体。',
    source: '艺术家捐赠',
    rights: '手稿版权归艺术家所有',
    tags: ['方案', '装置', '渔港'],
    artists: [1],
    exhibitions: [],
    cover: true
  },
  {
    title: '海南美术活动大事记（初稿）',
    category: '档案文件',
    author: '文献室 编',
    pub_date: '2024-03',
    year: 2024,
    extent: '文档 1 份',
    summary: '（示例条目）以年表形式汇总海南美术机构、展览与出版事件，作为站内“年表”栏目的数据基础。',
    content: '（示例正文）本稿仍在增补，欢迎提供线索：archives@example.com。',
    source: '文献室内部',
    rights: '内部资料',
    tags: ['大事记', '年表'],
    artists: [],
    exhibitions: [],
    cover: false
  }
];

const timeline = [
  { year: 1988, month: 4, title: '海南建省', category: '背景', description: '（示例）海南建省办经济特区，人口流动与文化机构建设进入新阶段。' },
  { year: 1989, month: 10, title: '海口首次当代艺术群体展', category: '展览', description: '（示例条目，待核实）海口举办当代艺术群体展，被视为本地当代艺术活动的起点之一。' },
  { year: 1993, month: 6, title: '海南青年美术协会成立', category: '机构', description: '（示例）本地青年艺术家组织成立，随后组织多次联展与交流活动。' },
  { year: 1996, month: 11, title: '岛屿现场：海南青年艺术家联展', category: '展览', description: '（示例）展出绘画、装置与影像作品三十余件，出版图录。' },
  { year: 2001, month: 5, title: '海口第一家当代艺术空间开放', category: '空间', description: '（示例）以替代性空间方式运营，举办展览与放映活动。' },
  { year: 2008, month: 3, title: '热带叙事：海南当代艺术观察', category: '展览', description: '（示例）以“热带”为线索的主题展，配套学术研讨会。' },
  { year: 2012, month: 5, title: '渔具与纪念碑方案草稿', category: '创作', description: '（示例）艺术家提出以废弃渔具构建临时纪念碑的未实施方案。' },
  { year: 2014, month: 7, title: '潮间带：海岛影像计划', category: '展览', description: '（示例）三亚影像展，展出十二部海岛影像作品。' },
  { year: 2017, month: 9, title: '海南当代艺术文献整理项目启动', category: '文献', description: '（示例）开始系统收集展览图录、请柬与剪报，并进行编目。' },
  { year: 2019, month: 9, title: '椰林下的现代性：海南美术三十年', category: '展览', description: '（示例）以文献与作品并置回顾1989年以来的地方美术进程。' },
  { year: 2021, month: 10, title: '海南艺术家口述史计划（第一辑）', category: '文献', description: '（示例）完成六位艺术家的口述访谈与整理稿。' },
  { year: 2023, month: 12, title: '海口双年展·边缘的半径', category: '展览', description: '（示例）以骑楼街区为展场的双年展，持续至次年2月。' },
  { year: 2024, month: 3, title: '数字文献档案库上线', category: '文献', description: '（示例）站内文献库开放检索，首批发布目录与数字化副本。' }
];

function insertDemo() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM documents').get().n;
  if (existing > 0) return false;

  const stamp = store.now();
  const insertArtist = db.prepare(
    `INSERT INTO artists (name, name_en, birth_year, death_year, birthplace, region, medium, bio, statement, portrait, tags, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const artistIds = artists.map((a) => {
    const info = insertArtist.run(
      a.name,
      a.name_en || null,
      a.birth_year || null,
      a.death_year || null,
      a.birthplace || null,
      a.region || null,
      a.medium || null,
      a.bio || null,
      a.statement || null,
      null,
      (a.tags || []).join(','),
      stamp,
      stamp
    );
    return Number(info.lastInsertRowid);
  });

  const insertExh = db.prepare(
    `INSERT INTO exhibitions (title, title_en, venue, city, start_date, end_date, year, curators, organizer, intro, poster, tags, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const exhIds = exhibitions.map((e) => {
    const info = insertExh.run(
      e.title,
      e.title_en || null,
      e.venue || null,
      e.city || null,
      e.start_date || null,
      e.end_date || null,
      e.year || (e.start_date ? Number(e.start_date.slice(0, 4)) : null),
      e.curators || null,
      e.organizer || null,
      e.intro || null,
      null,
      (e.tags || []).join(','),
      stamp,
      stamp
    );
    return Number(info.lastInsertRowid);
  });

  const insertDoc = db.prepare(
    `INSERT INTO documents (code, title, title_en, category, author, publisher, pub_date, year, extent, language, summary, content, cover, file_path, source, rights, tags, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const linkArtist = db.prepare('INSERT OR IGNORE INTO doc_artists (document_id, artist_id) VALUES (?, ?)');
  const linkExh = db.prepare(
    'INSERT OR IGNORE INTO doc_exhibitions (document_id, exhibition_id) VALUES (?, ?)'
  );

  documents.forEach((d, i) => {
    const code = `HNCA-D-${String(i + 1).padStart(4, '0')}`;
    const cover = d.cover ? ensureCover(i + 1, d.category, code) : null;
    const info = insertDoc.run(
      code,
      d.title,
      d.title_en || null,
      d.category,
      d.author || null,
      d.publisher || null,
      d.pub_date || null,
      d.year || null,
      d.extent || null,
      '中文',
      d.summary || null,
      d.content || null,
      cover,
      null,
      d.source || null,
      d.rights || null,
      (d.tags || []).join(','),
      stamp,
      stamp
    );
    const docId = Number(info.lastInsertRowid);
    (d.artists || []).forEach((idx) => {
      if (artistIds[idx]) linkArtist.run(docId, artistIds[idx]);
    });
    (d.exhibitions || []).forEach((idx) => {
      if (exhIds[idx]) linkExh.run(docId, exhIds[idx]);
    });
  });

  const insertEvent = db.prepare(
    `INSERT INTO timeline (year, month, date_text, title, description, category, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  timeline.forEach((t) => {
    insertEvent.run(t.year, t.month || null, null, t.title, t.description || null, t.category || null, stamp, stamp);
  });

  return true;
}

if (require.main === module) {
  const created = insertDemo();
  const admin = store.ensureAdmin();
  console.log(created ? '已写入示例数据。' : '数据库已有文献条目，跳过示例数据写入。');
  if (admin) {
    console.log(`已创建管理员账号：${admin.username} / ${admin.password}`);
    console.log('请登录后台后妥善保存此密码。');
  }
}

module.exports = { insertDemo };

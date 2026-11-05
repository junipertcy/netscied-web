# 第55屆金馬獎 (2018) nominee list: source notes

Compiled for netscied.tw. Date checked: 2026-11-04 (local time). The servers' `Date` headers read 2026-11-05 02:52–03:00 GMT.
Output: `nominations.csv` in this folder (UTF-8, no BOM, header exactly as specified).

## 1. Sources

### Primary sources (official, goldenhorse.org.tw)
| What | URL | Used for |
|---|---|---|
| Official 入圍得獎 database, 2018, "依獎項查看" view (Chinese) | https://www.goldenhorse.org.tw/awards/nw/?serach_type=award&sc=10&search_regist_year=2018&ins=53 | every row: category_zh, film_zh, nominee_zh, is_winner (this is the `source_url` on every row) |
| Same page, English (`r=en`, the site's own EN switch) | https://www.goldenhorse.org.tw/awards/nw/?r=en&serach_type=award&sc=10&search_regist_year=2018&ins=53 | category_en, film_en, English renderings of names (Appendix C), nominee_original for 包軒鳴 |
| Official nominee press release, 2018-10-01, 「第55屆金馬獎入圍名單公布」 | https://www.goldenhorse.org.tw/news/detail/1023 | cross-check. Its link "第55屆金馬獎入圍名單" (https://goo.gl/3UnNGF) still redirects (HTTP 302) to `http://www.goldenhorse.org.tw/awards/nw/?serach_type=award&sc=8&search_regist_year=2018&ins=47`, i.e. the same database page (it differs only in UI paging parameters). So the database page is the list the press release itself points to. |
| 2018 awards rules (第55屆 報名規章), official page as archived 2018-09-03 | http://web.archive.org/web/20180903062723/http://www.goldenhorse.org.tw:80/awards/submission/guidelines/ | category structure. 「影片類共五項…每部入圍影片獲頒入圍證書」 and 「個人類共十八項…每位入圍者獲頒入圍證書」 give 23 competitive categories. The song rule reads 「最佳原創電影歌曲 獎勵對象包含作詞者、作曲者及演唱者」. |
| Official DB page, Wayback copy of 2018-12-04 (the URL the press release links to) | http://web.archive.org/web/20181204005717/http://www.goldenhorse.org.tw/awards/nw/?serach_type=award&sc=8&search_regist_year=2018&ins=47 | check that the live page has not drifted since 2018 (see §4) |
| Site stylesheet | https://storage.googleapis.com/tghff_outland/css/style-theme.css | confirms that `tr.mark` rows get special styling: the winner highlight |

How winners were read: on the official page each winning entry is a `<tr class='mark'>`, which the site's stylesheet highlights. Exactly one entry per category is marked, 23 in total. All 23 agree with the 2018-12-04 archived copy, with zh.wikipedia, and with CNA's 2018-11-17 winners list (https://www.cna.com.tw/news/firstnews/201811175006.aspx). **Winners are included and verified** (`is_winner` = true/false on every row).

### Cross-check sources (not used to fill anything)
- zh.wikipedia 「第55屆金馬獎」, zh-tw variant, revision 91156028: https://zh.wikipedia.org/zh-tw/第55屆金馬獎
- CNA 2018-10-01 nominee report and 2018-11-17 winners list (cna.com.tw). PTT Golden-Award board copy of the ceremony-night official list (disp.cc/ptt/Golden-Award/1Ry3M4xT). GVM (gvm.com.tw/article/54884). All were seen only as search-result text.

## 2. Counts
| | |
|---|---|
| Competitive categories | **23** (5 film categories + 18 individual categories, matching the 2018 rules) |
| CSV data rows | **152** (148 rows naming a person, plus 4 Best Feature Film rows with an empty nominee) |
| Nominations, as distinct (category, film) pairs | 113 |
| Distinct films | **42** (FTV's 2018 report also says 「42部入圍作品…問鼎23項金馬獎」) |
| Distinct persons (distinct `nominee_zh` strings) | **134** |
| Distinct film–person pairs | 135 |
| Winning nominations / winner rows | 23 / 33 |

Per-film totals agree with the press release: 影 12, 誰先愛上他的 8, 我不是藥神 7, 大象席地而坐 6, 地球最後的夜晚 5. The Best Actor and Best Actress lists in the press release also agree.

Persons appearing in more than one (category, film) slot are counted once each: 陸慶屹, 傅榆, 宋欣穎, 張藝謀, 萬瑪才旦, 董越, 徐譽庭, 文牧野, 劉若英, 胡波, 劉強, 谷垣健治 (two different films), 盧律銘, 雷光夏. Each has a single, identical English rendering wherever it appears, which supports treating each as one person. Identity is still name-based only.

## 3. Modelling decisions (please review)
1. **Film categories** (最佳劇情長片, 最佳紀錄片, 最佳動畫長片, 最佳劇情短片, 最佳動畫短片). Under the 2018 rules the honouree is the film. The official list nonetheless prints names next to each film, so I followed the brief: one row per named *person*, and one empty-nominee row when the list names only companies.
   - 最佳紀錄片 and 最佳動畫長片 print `person<br />companies`, and the shorts print `person(s)<br />`. The part before the line break is printed in personal-name format on the EN page (e.g. "LU Qingyi<br />Rivers Pictures Co., Ltd."), so those names became rows. **The list does not state their role.**
   - 最佳劇情長片 prints only companies for 4 films (→ 4 empty-nominee rows). For 大象席地而坐 it prints 「楚延華, 胡永振」, which the EN page renders as "CHU Yanhua, HU Yongzhen", i.e. personal names. These became 2 rows. **Ambiguity:** their role is not stated on the list. Owner may prefer to drop these 2 rows so that all Best Feature Film entries are treated alike. relations.json does not have them (§6).
   - Companies (not persons) are left out of the CSV. They are listed in Appendix B.
2. **最佳原創電影歌曲.** The official list prints 詞 / 曲 / 唱 for each song. The 2018 rule says the award covers 作詞者、作曲者及演唱者, so each distinct person in any of the three roles got one row for the song's film (8 rows for 5 songs). The song title and per-person roles have no CSV column, so they are in Appendix A. If the site wants only writers, drop 陳奕迅 (唱 only). 楊大正 is both 曲 and 唱, so he stays.
3. **Co-nominees** are split on the list's commas, one row each (e.g. 徐譽庭 / 許智彥 for 最佳新導演; 4 VFX nominees for 狄仁傑之四大天王). Order follows the official page.
4. **nominee_original** is filled only where the official source gives a non-Chinese person's own name in its own (Latin) script:
   - `David CHIZALLET`: printed that way on the Chinese page itself, and used as nominee_zh too.
   - 包軒鳴 → `Jake POLLOCK`, from the official EN page.
   - Left empty:
     - Japanese nominees (岩井俊二, 中島長雄, 石井教雄, 前川英章, 谷垣健治). The official Chinese list prints kanji that serve as their names, and the EN page gives romanizations (IWAI Shunji etc.). No separate Japanese-script form is given, so I did not duplicate the kanji.
     - Korean nominees (朴英修, 蔡洙應, 池明求). Hangul is not given.
     - `UMA WANG`. Printed only in Latin on both pages, so nominee_zh = "UMA WANG". No Chinese-script form is given, and I did not supply one from memory.

   Appendix C has every official English rendering, if a nominee_en column is wanted later.
5. **Titles and names are kept byte-for-byte as printed**, including:
   - 當　一個人, written with U+3000 IDEOGRAPHIC SPACE
   - 鄭思藴 (U+85F4 藴, not 蘊)
   - 麥少峯 (峯)
   - 王傢軍
   - 吊吊揈
   - JV陳政文
   - full-width colons in 角頭2：王者再起, 後勁：王建民, 傘上：遍地開花, 葉問外傳：張天志
   - the full-width comma in 你好，之華 and 我們的青春，在台灣

   Category names are as the database prints them: **最佳劇情長片** (not 最佳劇情片), 最佳造型設計, 最佳原創電影音樂, and so on. There was no 最佳紀錄短片 in 2018.
6. `source_url` is the Chinese database page on every row. category_en and film_en come from its `r=en` twin listed above.
7. 四個春天 is the only nominated film with no link to an official film-archive page in the database. Its row is otherwise normal.

## 4. Special awards (not in CSV: no nominees)
As printed by the official database for 2018, each with a single recipient:
- 年度台灣傑出電影工作者 (Outstanding Taiwanese Filmmaker of the Year): 劉三郎 (Saburo LIU). It was announced at the 2018-10-01 nominee press conference.
- 特別貢獻獎 (Special Contribution Award): 廖慶松 (LIAO Ching-sung). This is the 2018 name of the 「金馬獎特別獎」 in the rules. **No 終身成就獎 was given in 2018.** It does not appear in the official database, the archived page or Wikipedia.
- 觀眾票選最佳影片 (Audience Choice Award): 大象席地而坐 (楚延華, 胡永振). It is a 非正式競賽 voted from the five Best Feature nominees.
- 國際影評人費比西獎 (FIPRESCI Prize): 暴雪將至 (16 companies listed).

## 5. Discrepancies between sources
Wherever sources differ, the CSV uses the spelling on the official page.

| Item | Official DB (live 2026-11-04 = archived 2018-12-04) | Other sources |
|---|---|---|
| 最佳造型設計, 邪不壓正 | `UMA WANG` (EN page also `UMA WANG`) | `Uma WANG`: zh.wikipedia, GVM, the PTT copy of the ceremony-night list, relations.json |
| 最佳視覺效果, 狄仁傑之四大天王 (order only) | 朴英修, 蔡洙應, 前川英章, 池明求 | 池明求, 蔡洙應, 朴英修, 前川英章: zh.wikipedia, GVM, PTT copy |
| Special award name | 年度**台**灣傑出電影工作者 | 年度**臺**灣傑出電影工作者: zh.wikipedia |
| 最佳原創電影歌曲 | song + 詞/曲/唱 credits | zh.wikipedia gives song titles only |
| Company of 後勁：王建民 (not in CSV) | 牽猴子股份有限公司 (live) | 牽猴子整合行銷股份有限公司 (2018-12-04 archive and PTT copy) |
| relations.json spellings | 朴英修, 張淑平 (EN: ZHANG Shuping), UMA WANG, 當　一個人 (U+3000), 吉祥 | 朴英秀, 張叔平, Uma WANG, 當 一個人 (ASCII space), 「吉祥 」 (trailing space). zh.wikipedia and the PTT copy agree with the official 朴英修 / 張淑平. |

A diff of the live page against the 2018-12-04 Wayback copy shows no difference in any category, film, person or winner mark. The only changes are comma spacing in company lists, the one company rename above, and the order of the special-award tables. Apart from the rows in the table, zh.wikipedia agrees with every CSV row: each film and person appears in the matching category section, and all 23 winners match.

## 6. Unverified
**None.** Every CSV row was read from the official page. Not verified, and left out of the CSV:
- the roles of 楚延華 / 胡永振 (§3.1)
- the roles of the persons named in the doc, animation and short-film categories, which are presumably directors but this is not stated on the list
- any Japanese or Hangul original-script forms

I did not open the individual official film-archive pages.

## 7. robots.txt and fetching
- **goldenhorse.org.tw**: `/robots.txt` returns HTTP 200 with an **empty body** (Content-Length 0, Last-Modified 2012-08-17), so nothing is disallowed. All pages fetched there are allowed. About 8 requests were made, at least 1 s apart, with curl's default user agent (curl/8.7.1) and no spoofing. The 2018 data is a plain GET URL (the year selector submits a GET form). No forms were automated and no CAPTCHA was met.
- **web.archive.org / archive.org**: web.archive.org has no robots.txt (404). archive.org's robots.txt disallows only /control/ and /report/. I made 4 availability-API calls and one CDX query (which timed out with no data), and fetched 2 snapshots.
- **storage.googleapis.com**: fetched 2 CSS files from the site's own bucket. The host root has no robots.txt (NoSuchBucket).
- **goo.gl**: one HEAD request to resolve the press-release link.
- **zh.wikipedia.org**: robots.txt has `Disallow: /w/` for generic agents. **Disclosure:** I made one `/w/api.php?action=parse` request before reading that rule. When I saw the rule I deleted the response unused and used the allowed article page `/zh-tw/第55屆金馬獎` instead.
- **jinma.today**: no robots.txt; `/robots.txt` returns HTTP 200 with the site's HTML "404 Page". I fetched `/`, `/relations` and `/infographics/relations.json` once each.
- News sites (CNA, ETtoday, RTI, GVM, PTT mirror) were seen only as search-result text and were not fetched directly.

## 8. Cross-check against `dataset/relations.json`
relations.json is not used as a source. Its shape is 174 nodes (42 film + 132 person) and 146 edges, all film→person. Each person's `pack` list agrees with the edges.
- **Films**: the same 42 titles as the CSV once whitespace is normalised. relations.json writes 「吉祥 」 with a trailing space and 「當 一個人」 with an ASCII space where the official title has U+3000.
- **Persons only in the CSV** (5):
  - 楚延華 and 胡永振, the two names printed for 大象席地而坐 under 最佳劇情長片. relations.json takes no names from the Best Feature Film credits.
  - three official spellings that relations.json writes differently: 朴英修, 張淑平, UMA WANG.
- **Persons only in relations.json** (3): 朴英秀, 張叔平, Uma WANG. These are the same three people under the variant spellings.

  Apart from these, the person sets are identical (129 names in common).
- **Edges**: the 146 edges are 133 distinct film–person pairs plus 13 repeats. The repeats are exactly the persons nominated twice for the same film: 董越, 徐譽庭, 文牧野, 劉若英, 胡波, 張藝謀, 萬瑪才旦, 宋欣穎, 傅榆, 陸慶屹, 劉強, 盧律銘, 雷光夏. So relations.json has one edge per (category, film, person) nomination with the category dropped. That is exactly the CSV's 148 person rows minus the 2 Best Feature names. relations.json also takes the doc, animation and short-film names and all song credits, including the singer 陳奕迅, which matches the treatment in §3.
- **Likely explanation**: relations.json was built from this same official 2018 list. It drops companies and the Best Feature credit names, leaves out award categories and winner flags, and introduces three spelling variants. Uma WANG matches 2018 ceremony-night copies. 朴英秀 and 張叔平 look like transcription errors. This last point is inference; the official spelling is kept.
- **The live endpoint has changed.** The file https://jinma.today/infographics/relations.json is what jinma.today/relations loads. Today it holds the **61st (2024)** list: 43 films (e.g. 青春18×2 通往有你的旅程), 131 persons, 135 edges, `Last-Modified: Tue, 21 Jan 2025 06:55:02 GMT`. Its schema is identical (same node keys and `pack`, same edge keys), but its sha256 (12ce6429…) differs from the local file's (f2626f0f…). So the local file is plausibly a 2018 snapshot of that same endpoint, but the current site cannot confirm this.

## 9. Provenance of the jinma.today JSON (owner item O1)
Checked https://jinma.today/ and https://jinma.today/relations on 2026-11-04. **No statement anywhere of who compiled the data, what its source is, or under what license or terms it may be used.** The menu has no about, terms or license page; it links only 金馬剖析 /relations, 歷屆回顧 /timeline, 獎項回顧 /timeline_prize, 金馬大聯盟 /league and a Facebook icon. The only relevant text, verbatim:
- Footer, both pages: `Copyright © 2016 Jinma`
- `<title>JINMA 來跨</title>`. The home page's canonical link is `https://jinma.today/timeline`.
- `<meta name="description" content="全球最完整的金馬電影主題網站，不僅帶您即時關注在華語電影界最高榮耀的金馬獎一舉一動，更為您鑑往知來地解讀金馬密碼，並密切觀察華語電影動向。">`
- `<meta property="article:author" content="https://www.facebook.com/JINMAmovie/">` and `<meta property="article:publisher" content="https://www.facebook.com/JINMAmovie/">`
- /relations og:description: `金馬獎 ${JINMA_SEQUENCE} 屆入圍名單已經公佈了，快來看看今年入圍的有那些好電影、好演員，讓我們一起來剖析入圍名單之間的關係圖哦！`
- The /relations legend reads 「金馬 62 關聯圖 … 位相關電影人 … 部入圍電影」, but the file loaded is `/infographics/relations.json` (the 61st edition, see §8).
- Not a statement, but possibly a lead: the site's scripts are named `cloudeep_tools.js`, `cloudeep_jinma.js` and `cloudeep_forcegraph.js`, which may point to a developer or studio called "cloudeep".

Conclusion: the site gives only a bare copyright notice ("Copyright © 2016 Jinma") and no license. Nothing permits reuse of its JSON. This supports compiling netscied.tw's network from the official list rather than from relations.json.

## Appendix A. 最佳原創電影歌曲: song credits as printed (official zh / en)
| Song | Film | 詞 Lyricist | 曲 Composer | 唱 Performer | Winner |
|---|---|---|---|---|---|
| 峇里島 (Bali Song) | 誰先愛上他的 | 李英宏 (LEE Ying-hung) | 李英宏 (LEE Ying-hung) | 李英宏 (LEE Ying-hung) | true |
| 老大借過 (Excuse you, Boss) | 角頭2：王者再起 | JV陳政文 (Edsion JV) | JV陳政文 (Edsion JV) | JV陳政文 (Edsion JV) | false |
| 迴光 (Light Echo) | 小美 | 盧律銘 (LU Luming) | 盧律銘, 楊大正 (LU Luming, Sam YANG) | 楊大正 (Sam YANG) | false |
| 我們 (US) | 後來的我們 | 葛大為 (David KE) | 陳建騏 (George CHEN) | 陳奕迅 (Eason CHAN) | false |
| 深無情 (Keep the Heart Out of It) | 范保德 | 雷光夏 (Summer LEI) | 雷光夏 (Summer LEI) | 雷光夏 (Summer LEI) | false |

## Appendix B. Companies named on the official list (not in CSV). 高雄人 is rendered "Kaohsiung Film Fund" on the EN page.
| Category | Film | Companies (zh as printed; the official ", " separator shown as 、) |
|---|---|---|
| 最佳劇情長片 | 誰先愛上他的 | 海納百川娛樂有限公司、原點概念有限公司、親愛的工作室有限公司 |
| 最佳劇情長片 | 影 | 樂視影業（北京）有限公司、上海騰訊影業文化傳播有限公司、完美威秀娛樂（香港）有限公司 |
| 最佳劇情長片 | 我不是藥神 | 北京壞猴子文化產業發展有限公司、花滿山（上海）影業有限公司、北京真樂道文化傳播有限公司、歡歡喜喜（天津）文化投資有限公司、北京京西文化旅遊股份有限公司、北京乾坤星宇文化發展有限公司、北京唐德國際電影文化有限公司、霍爾果斯壞猴子影視文化傳播有限公司 |
| 最佳劇情長片 | 地球最後的夜晚 | 浙江華策影視股份有限公司、蕩麥影業(上海)有限公司、華策影業（天津）有限公司、霍爾果斯太合數娛文化發展有限公司、上海亭東影業有限公司、上海騰訊影業文化傳播有限公司、中影（上海）影視文化投資管理中心（有限合夥）、華文創股份有限公司、天津貓眼微影文化傳媒有限公司、北京自由酷鯨影業有限公司、江蘇中南影業有限公司、道來影業（北京）有限公司、境界文化新沂有限公司、藍色星空影業有限公司、優酷信息技術（北京）有限公司、CG Cinéma |
| 最佳紀錄片 | 四個春天 | 百川影業無錫有限公司 |
| 最佳紀錄片 | 我們的青春，在台灣 | 七日印象電影有限公司 |
| 最佳紀錄片 | 後勁：王建民 | WYC Motions、藝博思國際有限公司、牽猴子股份有限公司 |
| 最佳紀錄片 | 24號大街 | 潘志琪紀錄片工作室 |
| 最佳紀錄片 | 傘上：遍地開花 | Lianain Films Pte. Ltd. |
| 最佳動畫長片 | 貓與桃花源 | 追光人動畫設計（北京）有限公司 |
| 最佳動畫長片 | 幸福路上 | 幸福路映畫社有限公司、傳影互動股份有限公司、高雄人 |
| 最佳動畫長片 | 狗狗傷心誌 | 阿哈股份有限公司 |

## Appendix C. Official English rendering of each nominee (from the r=en page, aligned by position; not a CSV column)
| nominee_zh | official English rendering |
|---|---|
| 楚延華 | CHU Yanhua |
| 胡永振 | HU Yongzhen |
| 陸慶屹 | LU Qingyi |
| 傅榆 | FU Yue |
| 陳惟揚 | Frank W CHEN |
| 潘志琪 | PAN Zhiqi |
| 梁思眾 | James LEONG |
| 王微 | Gary WANG |
| 宋欣穎 | SUNG Hsin-yin |
| 張毅 | CHANG Yi |
| 王逸帆 | WANG I-fan |
| 許慧如 | HSU Hui-ju |
| 王傢軍 | WANG Chia-chun |
| 大鵬 | Da Peng |
| 李駿碩 | Jun LI |
| 張徐展 | ZHANG XU Zhan |
| 黃勻弦 | HUANG Yun-hsien |
| 蔡易錦 | TSAI Yi-chin |
| 麥少峯 | MAK Siu Fung |
| 李柏誼 | Aggie LEE Pak Yee |
| 陳冠聰 | CHAN Kwun Chung |
| 王子妍 | WONG Tsz Yin |
| 鄭思藴 | CHANG See Wan |
| 張藝謀 | ZHANG Yimou |
| 畢贛 | BI Gan |
| 姜文 | JIANG Wen |
| 萬瑪才旦 | Pema Tseden |
| 婁燁 | LOU Ye |
| 段奕宏 | DUAN Yihong |
| 邱澤 | Roy CHIU |
| 鄧超 | DENG Chao |
| 徐崢 | XU Zheng |
| 彭昱暢 | PENG Yuchang |
| 謝盈萱 | HSIEH Ying-xuan |
| 孫儷 | SUN Li |
| 趙濤 | ZHAO Tao |
| 曾美慧孜 | Chloe Maayan |
| 周迅 | ZHOU Xun |
| 李鴻其 | LEE Hong-chi |
| 鄭人碩 | CHENG Jen-shuo |
| 章宇 | ZHANG Yu |
| 田壯壯 | TIAN Zhuang-zhuang |
| 袁富華 | Ben YUEN |
| 丁寧 | DING Ning |
| 惠英紅 | Kara WAI |
| 許晴 | XU Qing |
| 黃嘉千 | Phoebe HUANG |
| 張子楓 | ZHANG Zifeng |
| 董越 | DONG Yue |
| 徐譽庭 | Mag HSU |
| 許智彥 | HSU Chih-yen |
| 文牧野 | WEN Muye |
| 劉若英 | René LIU |
| 胡波 | HU Bo |
| 黃聖球 | Joseph HUANG |
| 謝章穎 | XIE Zhang-ying |
| 張再興 | CHANG Zhang-xing |
| 鍾家駿 | Si Pangoyod |
| 傅孟柏 | FU Meng-po |
| 呂蒔媛 | LU Shih-yuan |
| 何蔚庭 | HO Wi-ding |
| 韓家女 | HAN Jianv |
| 鍾偉 | ZHONG Wei |
| 岩井俊二 | IWAI Shunji |
| 李威 | LI Wei |
| 袁媛 | YUAN Yuan |
| 何昕明 | HO Shing-ming |
| 潘彧 | PAN Yu |
| 安巍 | AN Wei |
| 趙小丁 | ZHAO Xiaoding |
| 中島長雄 | NAKASHIMA Nagao |
| 姚宏易 | YAO Hung-i |
| 董勁松 | DONG Jinsong |
| David CHIZALLET | David CHIZALLET |
| 范超 | FAN Chao |
| 包軒鳴 | Jake POLLOCK |
| 王星會 | Samson WONG |
| 潘國瑜 | Ellen POON |
| 王紹帥 | WANG Shaoshuai |
| 楊月娟 | YANG Yuejuan |
| 石井教雄 | ISHII Norio |
| 朴英修 | PARK Young Soo |
| 蔡洙應 | Chuck CHAE |
| 前川英章 | MAEGAWA Hideaki |
| 池明求 | JI Myung Goo |
| 劉強 | LIU Qiang |
| 馬光榮 | MA Kwong-wing |
| 柳青 | LIU Qing |
| 屠楠 | TU Nan |
| 陸葦 | LU Wei |
| 黃文英 | HWARNG Wern-ying |
| 王誌成 | WANG Chih-cheng |
| 李華 | LI Hua |
| 陳敏正 | CHEN Minzheng |
| 李淼 | LI Miao |
| 董仲民 | DONG Zhongmin |
| UMA WANG | UMA WANG |
| 張淑平 | ZHANG Shuping |
| 陳同勛 | CHEN Tongxun |
| 谷軒昭 | DeeDee |
| 谷垣健治 | TANIGAKI Kenji |
| 袁信義 | YUEN Shun Yi |
| 何鈞 | HE Jun |
| 嚴華 | YAN Hua |
| 羅禮賢 | Bruce LAW |
| 羅義民 | Norman LAW |
| 撈仔 | Loudboy |
| 盧律銘 | LU Luming |
| 林強 | LIM Giong |
| 許志遠 | Point HSU |
| 雷光夏 | Summer LEI |
| 侯志堅 | Chris HOU |
| 花倫 | Hua Lun |
| 李英宏 | LEE Ying-hung |
| JV陳政文 | Edsion JV |
| 楊大正 | Sam YANG |
| 葛大為 | David KE |
| 陳建騏 | George CHEN |
| 陳奕迅 | Eason CHAN |
| 周肖林 | ZHOU Xiaolin |
| 郜子瑜 | GAO Ziyu |
| 江亦雋 | JIANG Yijun |
| 雷震卿 | LEI Chen-ching |
| 朱琳 | Jolin ZHU |
| 廖慶松 | LIAO Ching-sung |
| 孔勁蕾 | KONG Jinglei |
| 龍筱竹 | Emma LONG |
| 張金岩 | Rocky ZHANG |
| 楊江 | YANG Jiang |
| 趙楠 | ZHAO Nan |
| 李丹楓 | LI Danfeng |
| 司中林 | SI Zhonglin |
| 郭禮杞 | KUO Li-chi |
| 富康 | FU Kang |

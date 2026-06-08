-- Run in Supabase SQL Editor after 003_add_date_range.sql

CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  keywords text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read knowledge" ON knowledge_base FOR SELECT USING (auth.role() = 'authenticated');

-- Full-text search index
CREATE INDEX IF NOT EXISTS kb_fts_idx ON knowledge_base USING gin(to_tsvector('english', title || ' ' || content));

-- ── Seed knowledge base ─────────────────────────────────────────────────────
INSERT INTO knowledge_base (category, title, content, keywords) VALUES

('trend_types', 'Evergreen Products',
'Evergreen products maintain consistent demand throughout the year with minimal seasonal fluctuation. On Google Trends, they show a flat or gently oscillating line between 40–80 with low standard deviation (under 20). Examples: phone cases, kitchen knives, yoga mats, USB cables, toothbrushes, water bottles. Strategy: Reliable cash flow, can invest in long-term SEO and steady ad spend. Good for building review velocity since orders come in year-round. Watch for: slow market saturation risk, need to differentiate on quality or branding.',
ARRAY['evergreen','stable','consistent','year-round','reliable']),

('trend_types', 'Seasonal Products',
'Seasonal products show dramatic spikes at specific times of year — often 3–10x their baseline. On Google Trends the interest line is mostly flat with one or more sharp peaks. The peak-to-average ratio is usually above 2.5x. Examples: Christmas decorations (Nov-Dec), Halloween costumes (Oct), garden furniture (Mar-May), snow shovels (Nov-Jan), back-to-school supplies (Aug). Strategy: Order inventory 3–4 months before peak. Run PPC campaigns 6–8 weeks before season. Liquidate remaining stock after peak via promotions. Risk: Cash flow strain, storage costs during off-season.',
ARRAY['seasonal','spike','christmas','holiday','summer','winter','cyclical']),

('trend_types', 'Trending Up Products',
'Trending products show a clear upward slope on Google Trends — sustained growth over months. This is a strong buy signal for e-commerce sellers. Examples: standing desks (post-COVID), air fryers (2019-2022), LED strip lights. Strategy: Source quickly before competition increases. First-mover advantage in keywords and reviews is significant. Use the 5-year view to confirm this is genuine growth not just seasonal. Risk: May plateau or decline. Monitor monthly. Avoid heavy inventory bets on single trending products.',
ARRAY['trending','rising','growth','momentum','opportunity']),

('trend_types', 'Declining Products',
'Declining products show a negative slope on Google Trends. Demand is eroding over time. This could be due to: better alternatives entering market, changing consumer preferences, or a fad ending. Examples: fidget spinners (2017), CD/DVD products, certain camera accessories. Strategy: Avoid sourcing. If you hold inventory, discount aggressively to clear stock. Look for adjacent categories that are trending up.',
ARRAY['declining','falling','fad','saturated','avoid']),

('trend_types', 'Niche Products',
'Niche products have low but stable Google Trends scores (typically under 25). They serve a specific audience with consistent but modest demand. Examples: specific hobby equipment, professional tools, specialty dietary supplements. Strategy: Lower competition means lower PPC costs. Margins can be higher. Good for building authority in a niche category. Target long-tail keywords.',
ARRAY['niche','low volume','specialty','hobby','professional']),

('trend_types', 'Volatile Products',
'Volatile products show unpredictable spikes and crashes without a clear pattern. High standard deviation relative to the mean. Could be driven by viral moments, news events, or social media trends. Strategy: Only source small test quantities. Set up fast-replenishment relationships with suppliers. Monitor daily rather than weekly.',
ARRAY['volatile','unpredictable','viral','risky','spike']),

('research_strategy', 'How to Use Google Trends for Product Research',
'Step 1: Start broad — search the product category (e.g., "yoga mat") in 12-month view to assess baseline demand. Step 2: Identify the trend type (evergreen, seasonal, trending, etc.) Step 3: Switch to 5-year view to see long-term trajectory. Step 4: Check "Interest by Region" to find underserved markets. Step 5: Review rising queries for product variants consumers are searching. Step 6: Compare 3–5 competitor/variant keywords side by side in the Compare tool. Step 7: Cross-reference with Amazon Best Sellers and social media trends.',
ARRAY['strategy','research','methodology','google trends','product research']),

('research_strategy', 'Reading Interest by Region',
'Interest by Region shows relative search interest normalized to 100 in the highest-interest location. Key insights: (1) High scores in English-speaking markets (US, UK, AU) = strong English keyword opportunity. (2) High scores in non-English markets may indicate underserved demand. (3) Compare your target market region against competitors. (4) Regional data helps plan targeted PPC by geography. Note: A score of 50 means that region has half the interest of the peak region — not 50% of total searches.',
ARRAY['region','geography','market','location','targeting']),

('research_strategy', 'Seasonal Planning Calendar',
'Key seasonal peaks for e-commerce: Jan-Feb: Valentine''s Day gifts, fitness/new year products. Mar-Apr: Spring cleaning, gardening, Easter. May-Jun: Mother''s Day, outdoor/BBQ, graduation gifts. Jul-Aug: Back to school, summer sports, travel accessories. Sep-Oct: Halloween, autumn home decor, early Christmas sourcing. Nov-Dec: Black Friday, Christmas gifts, winter products. Pro tip: Source 3–4 months before peak. Start PPC 6–8 weeks before. List products on Amazon 8–10 weeks before peak to accumulate reviews.',
ARRAY['seasonal','calendar','planning','holiday','sourcing']),

('research_strategy', 'Comparing Keywords for Market Sizing',
'The Compare tool lets you see relative demand between keywords. Key technique: Compare your target keyword with a known product. Example: compare "bamboo toothbrush" vs "electric toothbrush". If bamboo toothbrush scores 20 while electric toothbrush scores 90, the market is roughly 4–5x smaller. This helps estimate: absolute search volume (use with Amazon search volume tools), competition level proxy, and niche size. Always compare within the same date range for accuracy.',
ARRAY['compare','market size','competition','keywords','demand']),

('ecommerce_tips', 'Product Research Scoring Framework',
'Score products 1–5 on each dimension: (1) Trend Health: Evergreen=5, Trending=4, Seasonal=3, Volatile=2, Declining=1. (2) Market Size: Peak interest >70=5, 50-70=4, 30-50=3, 10-30=2, <10=1. (3) Competition: Use rising queries count as proxy — more rising = more opportunity. (4) Margin Potential: Check Alibaba pricing vs Amazon selling price. (5) Differentiation: Are top queries for "best" or "cheap"? "Best" = quality differentiation possible. Target total score of 18+ to pursue sourcing.',
ARRAY['scoring','framework','decision','sourcing','evaluation']),

('ecommerce_tips', 'Rising Queries: Finding Underserved Niches',
'Rising queries in Google Trends are the most valuable signal for finding underserved niches. A query showing "+190%" means it was searched 190% more than the same period last year. "Breakout" means it grew over 5000%. Strategy: (1) Rising queries represent gaps in the market — fewer competitors have optimized for these terms. (2) Create product listings targeting these exact phrases. (3) Build PPC campaigns around rising terms before competitors notice. (4) Use rising topics to identify adjacent product categories to expand into.',
ARRAY['rising','queries','niche','opportunity','keywords','breakout']);

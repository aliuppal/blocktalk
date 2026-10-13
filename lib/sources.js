// Crypto newsrooms we pull from once a day. `weight` is editorial authority
// (1–10) and is the biggest single input to each article's rank.
export const SOURCES = [
  { id: 'coindesk',      name: 'CoinDesk',      domain: 'coindesk.com',      homepage: 'https://www.coindesk.com',      feed: 'https://www.coindesk.com/arc/outboundfeeds/rss/', weight: 10 },
  { id: 'theblock',      name: 'The Block',     domain: 'theblock.co',       homepage: 'https://www.theblock.co',       feed: 'https://www.theblock.co/rss.xml',                 weight: 9 },
  { id: 'cointelegraph', name: 'Cointelegraph', domain: 'cointelegraph.com', homepage: 'https://cointelegraph.com',     feed: 'https://cointelegraph.com/rss',                   weight: 9 },
  { id: 'decrypt',       name: 'Decrypt',       domain: 'decrypt.co',        homepage: 'https://decrypt.co',            feed: 'https://decrypt.co/feed',                         weight: 8 },
  { id: 'thedefiant',    name: 'The Defiant',   domain: 'thedefiant.io',     homepage: 'https://thedefiant.io',         feed: 'https://thedefiant.io/api/feed',                  weight: 7 },
  { id: 'cryptoslate',   name: 'CryptoSlate',   domain: 'cryptoslate.com',   homepage: 'https://cryptoslate.com',       feed: 'https://cryptoslate.com/feed/',                   weight: 7 },
  { id: 'cryptobriefing',name: 'Crypto Briefing',domain: 'cryptobriefing.com',homepage: 'https://cryptobriefing.com',   feed: 'https://cryptobriefing.com/feed/',                weight: 6 },
  { id: 'beincrypto',    name: 'BeInCrypto',    domain: 'beincrypto.com',    homepage: 'https://beincrypto.com',        feed: 'https://beincrypto.com/feed/',                    weight: 6 },
  { id: 'dailyhodl',     name: 'The Daily Hodl',domain: 'dailyhodl.com',     homepage: 'https://dailyhodl.com',         feed: 'https://dailyhodl.com/feed/',                     weight: 5 },
  { id: 'utoday',        name: 'U.Today',       domain: 'u.today',           homepage: 'https://u.today',               feed: 'https://u.today/rss',                             weight: 5 },
  { id: 'bitcoinist',    name: 'Bitcoinist',    domain: 'bitcoinist.com',    homepage: 'https://bitcoinist.com',        feed: 'https://bitcoinist.com/feed/',                    weight: 5 },
  { id: 'newsbtc',       name: 'NewsBTC',       domain: 'newsbtc.com',       homepage: 'https://www.newsbtc.com',       feed: 'https://www.newsbtc.com/feed/',                   weight: 5 },
];

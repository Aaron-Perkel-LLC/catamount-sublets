/**
 * Crawlers, link unfurlers and headless browsers: their signed-out "views"
 * are not people looking at a listing, so they are not counted. A missing
 * user agent counts as a bot.
 */
const BOT =
  /bot\b|bot\/|crawl|spider|slurp|scrape|fetch|preview|facebookexternalhit|facebot|embedly|quora link|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|discord|skype|slack|bitly|tumblr|redditbot|applebot|bingpreview|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|claude-web|anthropic|perplexity|ccbot|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|chrome-lighthouse|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|axios|node-fetch|undici|postman|insomnia|libwww|httpclient|monitor|uptime|pingdom|statuscake|vercel-screenshot|vercel-favicon/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? "";
  return ua.length === 0 || BOT.test(ua);
}

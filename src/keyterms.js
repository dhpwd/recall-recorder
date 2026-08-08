// Vocabulary sent to AssemblyAI as `keyterms_prompt` so domain terms and
// proper nouns transcribe correctly.
//
// This file holds only generic industry vocabulary, because the repository is
// public. Account, customer and partner names belong in `keyterms` in
// settings.json, which lives in the app's userData directory and is never
// committed. `buildKeyterms` merges the two.
//
// Limits: 1000 phrases on Universal-3 and later, 200 on Universal-2, and 6
// words per phrase. The request lists universal-2 as a fallback, so keep the
// combined total under 200.
//
// Ordinary English words are deliberately absent (Impact, Branch, Attribution):
// biasing toward them costs accuracy elsewhere and they transcribe correctly
// anyway.

const DOMAIN = [
  "customer data platform",
  "stateful CDP",
  "server-side tracking",
  "server-side GTM",
  "identity resolution",
  "identity graph",
  "first-party data",
  "data warehouse",
  "attribution model",
  "multi-touch attribution",
  "event schema",
  "event taxonomy",
  "Meta CAPI",
  "Conversions API",
  "UTM parameters",
  "consent mode",
  "data layer",
  "ETL pipeline",
  "reverse ETL",
  "churn cohort",
  "subscription lifecycle",
  "trial conversion",
];

const TOOLS = [
  "Mixpanel",
  "Amplitude",
  "GA4",
  "Google Analytics",
  "Purchasely",
  "RevenueCat",
  "BigQuery",
  "Snowflake",
  "Redshift",
  "Databricks",
  "Stape",
  "Segment",
  "RudderStack",
  "Snowplow",
  "mParticle",
  "Tealium",
  "AppsFlyer",
  "Adjust",
  "Klaviyo",
  "Braze",
  "Iterable",
  "Customer.io",
  "HubSpot",
  "Podscribe",
  "Fivetran",
  "Looker",
  "dbt",
];

function buildKeyterms(settings) {
  const custom = Array.isArray(settings?.keyterms) ? settings.keyterms : [];
  return [...DOMAIN, ...TOOLS, ...custom];
}

module.exports = { buildKeyterms };

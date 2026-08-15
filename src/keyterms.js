// Vocabulary sent to AssemblyAI as `keyterms_prompt` so domain terms and
// proper nouns transcribe correctly.
//
// This file holds only generic industry vocabulary, because the repository is
// public. Account, customer and partner names belong in `keyterms` in
// settings.json, which lives in the app's userData directory and is never
// committed. `buildKeyterms` merges the two.
//
// docs/transcripts.md, "Keyterms", covers what belongs in the list.
// docs/recall-api.md owns the provider limits the combined list has to fit.

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

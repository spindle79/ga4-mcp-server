import fetch from "node-fetch";

const BASE_URL = "http://localhost:3001";

async function testEndpoint(
  endpoint: string,
  params: Record<string, string | number>
) {
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const url = `${BASE_URL}/${endpoint}?${queryString}`;
  console.log(`\n🔍 Testing ${endpoint}...`);
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Success! Response:");
    console.log(JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error("❌ Error:", error);
    return null;
  }
}

async function runTests() {
  console.log("🚀 Starting REST API tests...\n");

  // Test URL Analytics
  await testEndpoint("getUrlAnalytics", {
    url: "/test-page",
    timeframe: "this month",
    trafficSourceLimit: 5,
  });

  // Test URL Engagement
  await testEndpoint("getUrlEngagement", {
    url: "/test-page",
    timeframe: "last week",
  });

  // Test Traffic Sources
  await testEndpoint("getUrlSourceTraffic", {
    url: "/test-page",
    timeframe: "this month",
    limit: 10,
  });

  // Test Conversions
  await testEndpoint("getUrlConversions", {
    url: "/test-page",
    timeframe: "last month",
  });

  console.log("\n✨ All tests completed!");
}

runTests().catch(console.error);

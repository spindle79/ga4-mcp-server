import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { config } from "dotenv";
import { z } from "zod";
import { randomUUID } from "crypto";
import { debugLog } from "./utils/debug.js";

// Load environment variables
config();

// Validate environment variables
const envSchema = z.object({
  GA_PROPERTY_ID: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),
  PORT: z.string().transform(Number).default("3001"),
  DEBUG: z.string().optional(),
});

console.log("🔍 Validating environment variables...");
const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error("❌ Invalid environment variables:", env.error.format());
  process.exit(1);
}

const { GA_PROPERTY_ID, GOOGLE_APPLICATION_CREDENTIALS, PORT, DEBUG } =
  env.data;
console.log("✅ Environment variables validated successfully");

// Debug logging utility with different log levels
function debugLog(
  level: "info" | "warn" | "error",
  message: string,
  data?: any
) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    const emoji = level === "info" ? "ℹ️" : level === "warn" ? "⚠️" : "🚨";
    console.log(`${emoji} [${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    console.log("-".repeat(80)); // Separator for better readability
  }
}

// Utility function to calculate date ranges
interface DateRange {
  startDate: string;
  endDate: string;
}

function getDateRange(timeframe?: string): DateRange {
  debugLog(
    "info",
    `📅 Calculating date range for timeframe: ${
      timeframe || "default (last 30 days)"
    }`
  );

  const today = new Date();
  const result: DateRange = {
    startDate: "",
    endDate: today.toISOString().split("T")[0],
  };

  switch (timeframe?.toLowerCase()) {
    case "today":
      result.startDate = today.toISOString().split("T")[0];
      break;
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      result.startDate = yesterday.toISOString().split("T")[0];
      result.endDate = result.startDate;
      break;
    }
    case "this week": {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      result.startDate = startOfWeek.toISOString().split("T")[0];
      break;
    }
    case "last week": {
      const endOfLastWeek = new Date(today);
      endOfLastWeek.setDate(today.getDate() - today.getDay() - 1);
      const startOfLastWeek = new Date(endOfLastWeek);
      startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
      result.startDate = startOfLastWeek.toISOString().split("T")[0];
      result.endDate = endOfLastWeek.toISOString().split("T")[0];
      break;
    }
    case "this month": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      result.startDate = startOfMonth.toISOString().split("T")[0];
      break;
    }
    case "last month": {
      const startOfLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
      );
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      result.startDate = startOfLastMonth.toISOString().split("T")[0];
      result.endDate = endOfLastMonth.toISOString().split("T")[0];
      break;
    }
    default: {
      const defaultStartDate = new Date(today);
      defaultStartDate.setDate(today.getDate() - 30);
      result.startDate = defaultStartDate.toISOString().split("T")[0];
    }
  }

  debugLog("info", "📅 Calculated date range:", result);
  return result;
}

console.log("🚀 Initializing Express app...");
const app = express();
app.use(express.json());
app.use(cors());

// Initialize Google Analytics client
console.log("🔌 Initializing Google Analytics client...");
const analyticsClient = new BetaAnalyticsDataClient();
console.log("✅ Google Analytics client initialized");

// Common interface for all analytics responses
interface AnalyticsResponse<T> {
  endpoint: string;
  path: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  result: T;
  timeBreakdown: {
    daily: Array<{
      date: string;
      metrics: T;
    }>;
    monthly: Array<{
      month: string; // YYYY-MM format
      metrics: T;
    }>;
  };
}

// Specific result types for each endpoint
interface EngagementMetrics {
  averageSessionDuration: number;
  bounceRate: number;
  engagedSessions: number;
  screenPageViewsPerSession: number;
}

interface TrafficSource {
  source: string;
  medium: string;
  pageViews: number;
  users: number;
}

interface ConversionEvent {
  eventName: string;
  count: number;
  conversions: number;
  value: number;
}

// Helper function to run GA4 query
async function getUrlPageViews(
  pagePath: string,
  startDate?: string,
  endDate?: string,
  timeframe?: string
) {
  const fnId = Math.random().toString(36).substring(7);
  console.log(`🔄 [${fnId}] getUrlPageViews called with:`, {
    pagePath,
    startDate,
    endDate,
    timeframe,
  });

  try {
    debugLog("info", "📊 Getting page views for:", {
      path: pagePath,
      startDate,
      endDate,
      timeframe,
    });

    const dateRange = timeframe ? getDateRange(timeframe) : getDateRange();
    console.log(`📅 [${fnId}] Using date range:`, dateRange);

    debugLog("info", "🔍 Preparing GA4 query with parameters:", {
      pagePath,
      startDate: startDate || dateRange.startDate,
      endDate: endDate || dateRange.endDate,
      timeframe,
    });

    console.log(`📡 [${fnId}] Calling GA4 API...`);
    let response;
    try {
      [response] = await analyticsClient.runReport({
        property: `properties/${GA_PROPERTY_ID}`,
        dateRanges: [
          {
            startDate: startDate || dateRange.startDate,
            endDate: endDate || dateRange.endDate,
          },
        ],
        dimensions: [
          {
            name: "pagePath",
          },
        ],
        metrics: [
          {
            name: "screenPageViews",
          },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: {
              value: pagePath,
              matchType: "EXACT",
            },
          },
        },
      });
      console.log(`✅ [${fnId}] GA4 API response received:`, response);
    } catch (apiError) {
      console.error(`❌ [${fnId}] GA4 API call failed:`, apiError);
      throw new Error(
        `GA4 API call failed: ${
          apiError instanceof Error ? apiError.message : "Unknown error"
        }`
      );
    }

    debugLog("info", "✅ Received GA4 API Response:", response);

    const result = {
      url: pagePath,
      startDate: startDate || dateRange.startDate,
      endDate: endDate || dateRange.endDate,
      pageViews: 0,
    };

    if (response?.rows && response.rows.length > 0) {
      try {
        result.pageViews = parseInt(
          response.rows[0].metricValues?.[0].value || "0",
          10
        );
        console.log(`📊 [${fnId}] Page views found:`, result.pageViews);
        debugLog("info", "📈 Found page views:", result.pageViews);
      } catch (parseError) {
        console.error(`❌ [${fnId}] Error parsing page views:`, parseError);
        throw new Error(
          `Failed to parse page views: ${
            parseError instanceof Error ? parseError.message : "Unknown error"
          }`
        );
      }
    } else {
      console.log(`⚠️ [${fnId}] No page views found for:`, pagePath);
      debugLog(
        "warn",
        "⚠️ No page views found for the specified path and date range"
      );
    }

    console.log(`✅ [${fnId}] Returning result:`, result);
    debugLog("info", "🏁 Final result:", result);
    return result;
  } catch (error) {
    console.error(`❌ [${fnId}] Error in getUrlPageViews:`, error);
    debugLog("error", "❌ Error fetching page views:", error);
    throw error;
  }
}

// Helper function to run GA4 query with time breakdown
async function runTimeBreakdownQuery(
  pagePath: string,
  startDate: string,
  endDate: string,
  dimensions: Array<{ name: string }>,
  metrics: Array<{ name: string }>,
  dimensionFilter?: any
) {
  const [response] = await analyticsClient.runReport({
    property: `properties/${GA_PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, ...dimensions],
    metrics,
    dimensionFilter,
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  return response;
}

// Helper function to group metrics by time period
function groupMetricsByTime(
  rows: any[] | null | undefined,
  metricNames: string[],
  timeFormat: "daily" | "monthly"
) {
  const groupedData = new Map();

  if (!rows) return [];

  rows.forEach((row) => {
    const date = row.dimensionValues?.[0]?.value || ""; // date is always first dimension
    if (!date) return;

    const timeKey = timeFormat === "daily" ? date : date.substring(0, 7); // YYYY-MM for monthly

    if (!groupedData.has(timeKey)) {
      groupedData.set(timeKey, {
        [timeFormat === "daily" ? "date" : "month"]: timeKey,
        metrics: {},
      });
    }

    const entry = groupedData.get(timeKey);
    metricNames.forEach((metric, index) => {
      const value = parseFloat(row.metricValues?.[index]?.value || "0");
      if (!entry.metrics[metric]) {
        entry.metrics[metric] = value;
      } else {
        entry.metrics[metric] += value;
      }
    });
  });

  return Array.from(groupedData.values());
}

// Define tool parameter types
interface GetUrlPageViewsParams {
  url: string;
  startDate?: string;
  endDate?: string;
  timeframe?: string;
}

interface GetUrlEngagementParams {
  url: string;
  startDate?: string;
  endDate?: string;
  timeframe?: string;
}

interface GetUrlSourceTrafficParams {
  url: string;
  startDate?: string;
  endDate?: string;
  timeframe?: string;
  limit?: number;
}

interface GetUrlConversionParams {
  url: string;
  startDate?: string;
  endDate?: string;
  timeframe?: string;
}

// Helper functions for GA4 queries
export async function getUrlEngagement(
  pagePath: string,
  startDate?: string,
  endDate?: string,
  timeframe?: string
): Promise<AnalyticsResponse<EngagementMetrics>> {
  const dateRange = timeframe ? getDateRange(timeframe) : getDateRange();
  const finalStartDate = startDate || dateRange.startDate;
  const finalEndDate = endDate || dateRange.endDate;

  const metrics = [
    { name: "averageSessionDuration" },
    { name: "bounceRate" },
    { name: "engagedSessions" },
    { name: "screenPageViewsPerSession" },
  ];

  const response = await runTimeBreakdownQuery(
    pagePath,
    finalStartDate,
    finalEndDate,
    [{ name: "pagePath" }],
    metrics,
    {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          value: pagePath,
          matchType: "EXACT",
        },
      },
    }
  );

  const metricNames = [
    "averageSessionDuration",
    "bounceRate",
    "engagedSessions",
    "screenPageViewsPerSession",
  ];
  const dailyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "daily"
  );
  const monthlyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "monthly"
  );

  const aggregatedMetrics: EngagementMetrics = {
    averageSessionDuration: 0,
    bounceRate: 0,
    engagedSessions: 0,
    screenPageViewsPerSession: 0,
  };

  if (response?.rows && response.rows.length > 0) {
    let totalSessions = 0;
    response.rows.forEach((row) => {
      const sessions = parseInt(row.metricValues?.[2]?.value || "0", 10);
      const pageViews = parseFloat(row.metricValues?.[3]?.value || "0");
      totalSessions += sessions;
      aggregatedMetrics.engagedSessions += sessions;
      aggregatedMetrics.screenPageViewsPerSession += pageViews;
    });

    aggregatedMetrics.averageSessionDuration =
      response.rows.reduce(
        (acc, row) => acc + parseFloat(row.metricValues?.[0]?.value || "0"),
        0
      ) / response.rows.length;
    aggregatedMetrics.bounceRate =
      response.rows.reduce(
        (acc, row) => acc + parseFloat(row.metricValues?.[1]?.value || "0"),
        0
      ) / response.rows.length;
    aggregatedMetrics.screenPageViewsPerSession /= response.rows.length;
  }

  return {
    endpoint: "getUrlEngagement",
    path: pagePath,
    dateRange: {
      startDate: finalStartDate,
      endDate: finalEndDate,
    },
    result: aggregatedMetrics,
    timeBreakdown: {
      daily: dailyBreakdown.map((day) => ({
        date: day.date,
        metrics: day.metrics as EngagementMetrics,
      })),
      monthly: monthlyBreakdown.map((month) => ({
        month: month.month,
        metrics: month.metrics as EngagementMetrics,
      })),
    },
  };
}

export async function getUrlSourceTraffic(
  pagePath: string,
  startDate?: string,
  endDate?: string,
  timeframe?: string,
  limit: number = 10
): Promise<AnalyticsResponse<TrafficSource[]>> {
  const dateRange = timeframe ? getDateRange(timeframe) : getDateRange();
  const finalStartDate = startDate || dateRange.startDate;
  const finalEndDate = endDate || dateRange.endDate;

  const metrics = [{ name: "screenPageViews" }, { name: "totalUsers" }];

  const response = await runTimeBreakdownQuery(
    pagePath,
    finalStartDate,
    finalEndDate,
    [
      { name: "pagePath" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ],
    metrics,
    {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          value: pagePath,
          matchType: "EXACT",
        },
      },
    }
  );

  const metricNames = ["screenPageViews", "totalUsers"];
  const dailyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "daily"
  );
  const monthlyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "monthly"
  );

  const sources: TrafficSource[] =
    response?.rows?.map((row) => ({
      source: row.dimensionValues?.[2]?.value || "unknown",
      medium: row.dimensionValues?.[3]?.value || "unknown",
      pageViews: parseInt(row.metricValues?.[0]?.value || "0", 10),
      users: parseInt(row.metricValues?.[1]?.value || "0", 10),
    })) || [];

  return {
    endpoint: "getUrlSourceTraffic",
    path: pagePath,
    dateRange: {
      startDate: finalStartDate,
      endDate: finalEndDate,
    },
    result: sources,
    timeBreakdown: {
      daily: dailyBreakdown.map((day) => ({
        date: day.date,
        metrics: day.metrics as TrafficSource[],
      })),
      monthly: monthlyBreakdown.map((month) => ({
        month: month.month,
        metrics: month.metrics as TrafficSource[],
      })),
    },
  };
}

export async function getUrlConversions(
  pagePath: string,
  startDate?: string,
  endDate?: string,
  timeframe?: string
): Promise<AnalyticsResponse<ConversionEvent[]>> {
  const dateRange = timeframe ? getDateRange(timeframe) : getDateRange();
  const finalStartDate = startDate || dateRange.startDate;
  const finalEndDate = endDate || dateRange.endDate;

  const metrics = [
    { name: "eventCount" },
    { name: "conversions" },
    { name: "eventValue" },
  ];

  const response = await runTimeBreakdownQuery(
    pagePath,
    finalStartDate,
    finalEndDate,
    [{ name: "pagePath" }, { name: "eventName" }],
    metrics,
    {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "pagePath",
              stringFilter: {
                value: pagePath,
                matchType: "EXACT",
              },
            },
          },
          {
            filter: {
              fieldName: "eventName",
              stringFilter: {
                matchType: "CONTAINS",
                value: "conversion",
              },
            },
          },
        ],
      },
    }
  );

  const metricNames = ["eventCount", "conversions", "eventValue"];
  const dailyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "daily"
  );
  const monthlyBreakdown = groupMetricsByTime(
    response?.rows,
    metricNames,
    "monthly"
  );

  const conversions: ConversionEvent[] =
    response?.rows?.map((row) => ({
      eventName: row.dimensionValues?.[1]?.value || "unknown",
      count: parseInt(row.metricValues?.[0]?.value || "0", 10),
      conversions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      value: parseFloat(row.metricValues?.[2]?.value || "0"),
    })) || [];

  return {
    endpoint: "getUrlConversions",
    path: pagePath,
    dateRange: {
      startDate: finalStartDate,
      endDate: finalEndDate,
    },
    result: conversions,
    timeBreakdown: {
      daily: dailyBreakdown.map((day) => ({
        date: day.date,
        metrics: day.metrics as ConversionEvent[],
      })),
      monthly: monthlyBreakdown.map((month) => ({
        month: month.month,
        metrics: month.metrics as ConversionEvent[],
      })),
    },
  };
}

interface AggregatedAnalytics {
  engagement: EngagementMetrics;
  traffic: TrafficSource[];
  conversions: ConversionEvent[];
}

export async function getUrlAnalytics(
  pagePath: string,
  startDate?: string,
  endDate?: string,
  timeframe?: string,
  trafficSourceLimit: number = 10
): Promise<AnalyticsResponse<AggregatedAnalytics>> {
  // Run all queries in parallel for better performance
  const [engagement, traffic, conversions] = await Promise.all([
    getUrlEngagement(pagePath, startDate, endDate, timeframe),
    getUrlSourceTraffic(
      pagePath,
      startDate,
      endDate,
      timeframe,
      trafficSourceLimit
    ),
    getUrlConversions(pagePath, startDate, endDate, timeframe),
  ]);

  return {
    endpoint: "getUrlAnalytics",
    path: pagePath,
    dateRange: {
      startDate:
        startDate ||
        (timeframe
          ? getDateRange(timeframe).startDate
          : getDateRange().startDate),
      endDate:
        endDate ||
        (timeframe ? getDateRange(timeframe).endDate : getDateRange().endDate),
    },
    result: {
      engagement: engagement.result,
      traffic: traffic.result,
      conversions: conversions.result,
    },
    timeBreakdown: {
      daily: engagement.timeBreakdown.daily.map((day) => ({
        date: day.date,
        metrics: {
          engagement: day.metrics,
          traffic:
            traffic.timeBreakdown.daily.find((t) => t.date === day.date)
              ?.metrics || [],
          conversions:
            conversions.timeBreakdown.daily.find((c) => c.date === day.date)
              ?.metrics || [],
        },
      })),
      monthly: engagement.timeBreakdown.monthly.map((month) => ({
        month: month.month,
        metrics: {
          engagement: month.metrics,
          traffic:
            traffic.timeBreakdown.monthly.find((t) => t.month === month.month)
              ?.metrics || [],
          conversions:
            conversions.timeBreakdown.monthly.find(
              (c) => c.month === month.month
            )?.metrics || [],
        },
      })),
    },
  };
}

// Create MCP server instance
console.log("🛠️ Creating MCP server instance...");
const server = new McpServer({
  name: "google-analytics-mcp",
  version: "1.0.0",
  capabilities: {
    tools: true, // Enable tools capability
    resources: false, // We don't use resources
    prompts: false, // We don't use prompts
  },
  tools: {
    getUrlPageViews: {
      description: "Get page views for a specific URL",
      parameters: {
        url: {
          type: "string",
          description: "The URL path to get page views for (e.g. /about)",
          required: true,
        },
        startDate: {
          type: "string",
          description:
            "Start date in YYYY-MM-DD format (defaults based on timeframe or 30 days ago)",
          required: false,
        },
        endDate: {
          type: "string",
          description:
            "End date in YYYY-MM-DD format (defaults based on timeframe or today)",
          required: false,
        },
        timeframe: {
          type: "string",
          description:
            "Predefined timeframe (today, yesterday, this week, last week, this month, last month)",
          required: false,
        },
      },
      handler: async (params: GetUrlPageViewsParams) => {
        const handlerId = Math.random().toString(36).substring(7);
        console.log(
          `🎯 [${handlerId}] MCP Tool handler called with parameters:`,
          params
        );
        debugLog("info", "🎯 MCP Tool called with parameters:", params);

        try {
          console.log(`📤 [${handlerId}] Calling getUrlPageViews...`);
          let result;
          try {
            result = await getUrlPageViews(
              params.url,
              params.startDate,
              params.endDate,
              params.timeframe
            );
          } catch (pageViewsError) {
            console.error(
              `❌ [${handlerId}] getUrlPageViews failed:`,
              pageViewsError
            );
            throw pageViewsError;
          }

          console.log(
            `✅ [${handlerId}] getUrlPageViews succeeded, preparing response...`
          );
          debugLog("info", "✅ MCP Tool execution successful");

          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };

          console.log(`📦 [${handlerId}] Returning response:`, response);
          return response;
        } catch (error) {
          console.error(`❌ [${handlerId}] Error in handler:`, error);
          debugLog("error", "❌ MCP Tool execution failed:", error);
          throw new Error(
            `Failed to fetch page views: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      },
    },

    getUrlEngagement: {
      description: "Get engagement metrics for a specific URL",
      parameters: {
        url: {
          type: "string",
          description:
            "The URL path to get engagement metrics for (e.g. /about)",
          required: true,
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
          required: false,
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
          required: false,
        },
        timeframe: {
          type: "string",
          description:
            "Predefined timeframe (today, yesterday, this week, last week, this month, last month)",
          required: false,
        },
      },
      handler: async (params: GetUrlEngagementParams) => {
        const result = await getUrlEngagement(
          params.url,
          params.startDate,
          params.endDate,
          params.timeframe
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },

    getUrlSourceTraffic: {
      description: "Get traffic sources for a specific URL",
      parameters: {
        url: {
          type: "string",
          description: "The URL path to get traffic sources for (e.g. /about)",
          required: true,
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
          required: false,
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
          required: false,
        },
        timeframe: {
          type: "string",
          description:
            "Predefined timeframe (today, yesterday, this week, last week, this month, last month)",
          required: false,
        },
        limit: {
          type: "number",
          description: "Maximum number of sources to return",
          required: false,
        },
      },
      handler: async (params: GetUrlSourceTrafficParams) => {
        const result = await getUrlSourceTraffic(
          params.url,
          params.startDate,
          params.endDate,
          params.timeframe,
          params.limit
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },

    getUrlConversions: {
      description: "Get conversion events for a specific URL",
      parameters: {
        url: {
          type: "string",
          description: "The URL path to get conversions for (e.g. /about)",
          required: true,
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
          required: false,
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
          required: false,
        },
        timeframe: {
          type: "string",
          description:
            "Predefined timeframe (today, yesterday, this week, last week, this month, last month)",
          required: false,
        },
      },
      handler: async (params: GetUrlConversionParams) => {
        const result = await getUrlConversions(
          params.url,
          params.startDate,
          params.endDate,
          params.timeframe
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },

    getUrlAnalytics: {
      description:
        "Get all analytics data for a specific URL (engagement, traffic sources, and conversions)",
      parameters: {
        url: {
          type: "string",
          description: "The URL path to analyze (e.g. /about)",
          required: true,
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
          required: false,
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
          required: false,
        },
        timeframe: {
          type: "string",
          description:
            "Predefined timeframe (today, yesterday, this week, last week, this month, last month)",
          required: false,
        },
        trafficSourceLimit: {
          type: "number",
          description: "Maximum number of traffic sources to return",
          required: false,
        },
      },
      handler: async (params: {
        url: string;
        startDate?: string;
        endDate?: string;
        timeframe?: string;
        trafficSourceLimit?: number;
      }) => {
        const result = await getUrlAnalytics(
          params.url,
          params.startDate,
          params.endDate,
          params.timeframe,
          params.trafficSourceLimit
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },
  },
});
console.log("✅ MCP server instance created");

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Initialize transport for a session
async function initializeTransport(
  sessionId?: string
): Promise<StreamableHTTPServerTransport> {
  debugLog("info", "Initializing transport", { sessionId });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId || randomUUID(),
    onsessioninitialized: (newSessionId) => {
      debugLog("info", "Session initialized", { newSessionId });
      transports[newSessionId] = transport;
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      debugLog("info", "Cleaning up transport", {
        sessionId: transport.sessionId,
      });
      delete transports[transport.sessionId];
    }
  };

  try {
    debugLog("info", "Connecting transport to server");
    await server.connect(transport);
    debugLog("info", "Transport connected successfully", {
      sessionId: transport.sessionId,
    });
    return transport;
  } catch (error) {
    debugLog("error", "Failed to connect transport to server", { error });
    throw new Error("Failed to initialize transport");
  }
}

// Handle MCP requests
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    // Check if this is an initialization request
    const isInitRequest = req.body?.method === "initialize";

    // Verify Accept header includes both required content types
    const acceptHeader = req.headers.accept;
    if (
      !acceptHeader ||
      !(
        acceptHeader.includes("application/json") &&
        acceptHeader.includes("text/event-stream")
      )
    ) {
      res.status(406).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Not Acceptable: Client must accept both application/json and text/event-stream",
        },
        id: req.body?.id || null,
      });
      return;
    }

    if (sessionId && transports[sessionId] && !isInitRequest) {
      debugLog("info", "Using existing transport for session", { sessionId });
      transport = transports[sessionId];
    } else {
      debugLog("info", "Creating new transport", { sessionId });
      try {
        transport = await initializeTransport(sessionId);
      } catch (error) {
        debugLog("error", "Transport initialization failed", { error });
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Failed to initialize session",
          },
          id: req.body?.id || null,
        });
        return;
      }
    }

    // Set response headers
    res.setHeader("Content-Type", "application/json");

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    debugLog("error", "Error handling MCP request", { error });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        id: req.body?.id || null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      debugLog("warn", "Invalid or missing session ID", { sessionId });
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    // Set response headers
    res.setHeader("Content-Type", "application/json");

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    debugLog("error", "Error handling GET request", { error });
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

app.delete("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      debugLog("warn", "Invalid or missing session ID for deletion", {
        sessionId,
      });
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports[sessionId];

    // Set response headers
    res.setHeader("Content-Type", "application/json");

    await transport.handleRequest(req, res);

    // Clean up the transport after successful deletion
    delete transports[sessionId];
    debugLog("info", "Transport deleted", { sessionId });
  } catch (error) {
    debugLog("error", "Error handling DELETE request", { error });
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

// Add REST endpoints
app.get("/getUrlAnalytics", async (req: Request, res: Response) => {
  try {
    const { url, startDate, endDate, timeframe, trafficSourceLimit } =
      req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url parameter" });
      return;
    }

    const result = await getUrlAnalytics(
      url,
      startDate as string,
      endDate as string,
      timeframe as string,
      trafficSourceLimit
        ? parseInt(trafficSourceLimit as string, 10)
        : undefined
    );

    res.json(result);
  } catch (error) {
    console.error("Error in getUrlAnalytics:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/getUrlEngagement", async (req: Request, res: Response) => {
  try {
    const { url, startDate, endDate, timeframe } = req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url parameter" });
      return;
    }

    const result = await getUrlEngagement(
      url,
      startDate as string,
      endDate as string,
      timeframe as string
    );

    res.json(result);
  } catch (error) {
    console.error("Error in getUrlEngagement:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/getUrlSourceTraffic", async (req: Request, res: Response) => {
  try {
    const { url, startDate, endDate, timeframe, limit } = req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url parameter" });
      return;
    }

    const result = await getUrlSourceTraffic(
      url,
      startDate as string,
      endDate as string,
      timeframe as string,
      limit ? parseInt(limit as string, 10) : undefined
    );

    res.json(result);
  } catch (error) {
    console.error("Error in getUrlSourceTraffic:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/getUrlConversions", async (req: Request, res: Response) => {
  try {
    const { url, startDate, endDate, timeframe } = req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url parameter" });
      return;
    }

    const result = await getUrlConversions(
      url,
      startDate as string,
      endDate as string,
      timeframe as string
    );

    res.json(result);
  } catch (error) {
    console.error("Error in getUrlConversions:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Global error handler for Express 5
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Global error handler:", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Internal Server Error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`✨ MCP server listening on port ${PORT}`);
  console.log(`🔗 Connected to GA4 property: ${GA_PROPERTY_ID}`);
  console.log(`🐛 Debug mode: ${DEBUG ? "enabled" : "disabled"}`);
});

import { config } from "dotenv";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import {
  getUrlEngagement,
  getUrlSourceTraffic,
  getUrlConversions,
} from "../server";

// Load environment variables from .env file
config();

describe("Google Analytics Integration", () => {
  let analyticsClient: BetaAnalyticsDataClient;

  beforeAll(() => {
    // Initialize the GA client
    analyticsClient = new BetaAnalyticsDataClient();
  });

  it("should fetch page views for /ai-solutions-for-storage", async () => {
    const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;
    if (!GA_PROPERTY_ID) {
      throw new Error("GA_PROPERTY_ID environment variable is not set");
    }

    // Get date range for last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const [response] = await analyticsClient.runReport({
      property: `properties/${GA_PROPERTY_ID}`,
      dateRanges: [
        {
          startDate: thirtyDaysAgo.toISOString().split("T")[0],
          endDate: today.toISOString().split("T")[0],
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
            value: "/ai-solutions-for-storage",
            matchType: "EXACT",
          },
        },
      },
    });

    console.log("Response:", JSON.stringify(response, null, 2));

    // Basic validation of the response structure
    expect(response).toBeDefined();
    expect(response.rows).toBeDefined();

    if (response.rows && response.rows.length > 0) {
      const pageViews = parseInt(
        response.rows[0].metricValues?.[0].value || "0",
        10
      );
      console.log("Page views for /ai-solutions-for-storage:", pageViews);
      expect(typeof pageViews).toBe("number");
      expect(pageViews).toBeGreaterThanOrEqual(0);
    } else {
      console.log("No page views found for /ai-solutions-for-storage");
    }
  }, 30000); // Timeout after 30 seconds
});

describe("Google Analytics Endpoints", () => {
  let mockRunReport: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunReport = jest.fn();
    (BetaAnalyticsDataClient as unknown as jest.Mock).mockImplementation(
      () => ({
        runReport: mockRunReport,
      })
    );
  });

  describe("getUrlEngagement", () => {
    const mockEngagementResponse = {
      rows: [
        {
          dimensionValues: [{ value: "/test-page" }],
          metricValues: [
            { value: "120.5" }, // averageSessionDuration
            { value: "0.45" }, // bounceRate
            { value: "100" }, // engagedSessions
            { value: "2.5" }, // screenPageViewsPerSession
          ],
        },
      ],
    };

    it("should return engagement metrics for a specific URL", async () => {
      mockRunReport.mockResolvedValueOnce([mockEngagementResponse]);

      const result = await getUrlEngagement("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlEngagement",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: {
          averageSessionDuration: 120.5,
          bounceRate: 0.45,
          engagedSessions: 100,
          screenPageViewsPerSession: 2.5,
        },
      });

      expect(mockRunReport).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: [{ name: "pagePath" }],
          metrics: [
            { name: "averageSessionDuration" },
            { name: "bounceRate" },
            { name: "engagedSessions" },
            { name: "screenPageViewsPerSession" },
          ],
        })
      );
    });

    it("should handle empty response data", async () => {
      mockRunReport.mockResolvedValueOnce([{ rows: [] }]);

      const result = await getUrlEngagement("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlEngagement",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: {
          averageSessionDuration: 0,
          bounceRate: 0,
          engagedSessions: 0,
          screenPageViewsPerSession: 0,
        },
      });
    });

    it("should use custom date range when provided", async () => {
      mockRunReport.mockResolvedValueOnce([mockEngagementResponse]);

      const result = await getUrlEngagement(
        "/test-page",
        "2024-01-01",
        "2024-01-31"
      );

      expect(result.dateRange).toEqual({
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });
    });
  });

  describe("getUrlSourceTraffic", () => {
    const mockSourceTrafficResponse = {
      rows: [
        {
          dimensionValues: [
            { value: "/test-page" },
            { value: "google" },
            { value: "organic" },
          ],
          metricValues: [
            { value: "500" }, // screenPageViews
            { value: "300" }, // totalUsers
          ],
        },
        {
          dimensionValues: [
            { value: "/test-page" },
            { value: "facebook" },
            { value: "social" },
          ],
          metricValues: [{ value: "200" }, { value: "150" }],
        },
      ],
    };

    it("should return traffic sources for a specific URL", async () => {
      mockRunReport.mockResolvedValueOnce([mockSourceTrafficResponse]);

      const result = await getUrlSourceTraffic("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlSourceTraffic",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: [
          {
            source: "google",
            medium: "organic",
            pageViews: 500,
            users: 300,
          },
          {
            source: "facebook",
            medium: "social",
            pageViews: 200,
            users: 150,
          },
        ],
      });

      expect(mockRunReport).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: [
            { name: "pagePath" },
            { name: "sessionSource" },
            { name: "sessionMedium" },
          ],
          metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        })
      );
    });

    it("should respect the limit parameter", async () => {
      mockRunReport.mockResolvedValueOnce([mockSourceTrafficResponse]);

      await getUrlSourceTraffic(
        "/test-page",
        undefined,
        undefined,
        undefined,
        5
      );

      expect(mockRunReport).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        })
      );
    });

    it("should handle empty response data", async () => {
      mockRunReport.mockResolvedValueOnce([{ rows: [] }]);

      const result = await getUrlSourceTraffic("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlSourceTraffic",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: [],
      });
    });
  });

  describe("getUrlConversions", () => {
    const mockConversionResponse = {
      rows: [
        {
          dimensionValues: [
            { value: "/test-page" },
            { value: "purchase_conversion" },
          ],
          metricValues: [
            { value: "50" }, // eventCount
            { value: "30" }, // conversions
            { value: "1500.5" }, // eventValue
          ],
        },
        {
          dimensionValues: [
            { value: "/test-page" },
            { value: "signup_conversion" },
          ],
          metricValues: [{ value: "100" }, { value: "75" }, { value: "0" }],
        },
      ],
    };

    it("should return conversion data for a specific URL", async () => {
      mockRunReport.mockResolvedValueOnce([mockConversionResponse]);

      const result = await getUrlConversions("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlConversions",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: [
          {
            eventName: "purchase_conversion",
            count: 50,
            conversions: 30,
            value: 1500.5,
          },
          {
            eventName: "signup_conversion",
            count: 100,
            conversions: 75,
            value: 0,
          },
        ],
      });

      expect(mockRunReport).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: [{ name: "pagePath" }, { name: "eventName" }],
          metrics: [
            { name: "eventCount" },
            { name: "conversions" },
            { name: "eventValue" },
          ],
        })
      );
    });

    it("should handle empty response data", async () => {
      mockRunReport.mockResolvedValueOnce([{ rows: [] }]);

      const result = await getUrlConversions("/test-page");

      expect(result).toEqual({
        endpoint: "getUrlConversions",
        path: "/test-page",
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
        result: [],
      });
    });

    it("should use predefined timeframe when provided", async () => {
      mockRunReport.mockResolvedValueOnce([mockConversionResponse]);

      const result = await getUrlConversions(
        "/test-page",
        undefined,
        undefined,
        "last week"
      );

      expect(result).toEqual(
        expect.objectContaining({
          endpoint: "getUrlConversions",
          path: "/test-page",
          dateRange: {
            startDate: expect.any(String),
            endDate: expect.any(String),
          },
        })
      );
    });
  });
});

# Google Analytics MCP Server

This server provides access to Google Analytics 4 data through both MCP (Model Context Protocol) and REST endpoints. It allows you to fetch various analytics metrics for specific URLs, including page views, engagement metrics, traffic sources, and conversions.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **At a glance** — A small, focused MCP server that exposes Google Analytics 4 data to AI agents. Built on the official `@modelcontextprotocol/sdk` (Streamable HTTP transport) over Express, with the same tool surface available as plain REST endpoints for non-MCP clients. Five tools: `getUrlAnalytics`, `getUrlEngagement`, `getUrlSourceTraffic`, `getUrlConversions`, `getUrlPageViews`.
>
> **What this repo demonstrates**
>
> - **A real MCP server** — uses the actual `@modelcontextprotocol/sdk` (`McpServer` + `StreamableHTTPServerTransport`), not a sketch. Same tools available via MCP and REST, no schema duplication.
> - **GA4 Data API integration** — `BetaAnalyticsDataClient` from `@google-analytics/data` with service-account auth, and a small URL-path → GA filter abstraction so callers ask "what happened on `/about`" rather than "give me a `pagePathPlusQueryString` filter expression."
> - **Useful response shape** — every endpoint returns the headline numbers plus a `timeBreakdown.daily` and `timeBreakdown.monthly` series so an agent can answer "how did that change over the period?" without a follow-up call.
> - **Honest dev experience** — Zod-validated env, structured debug logging behind a `DEBUG` flag, Jest tests, an `mcp-inspector`-driven smoke script (`pnpm test:mcp`), and a parallel REST smoke script (`pnpm test:rest`).
>
> **Quickstart**
>
> ```bash
> pnpm install
> cp .env.example .env             # fill in GA_PROPERTY_ID + path to service-account JSON
> pnpm dev                         # http://localhost:3001
> pnpm test:rest                   # smoke-test the REST endpoints
> ```
>
> Full setup, endpoint reference, response schema, and error handling are documented below.

---

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables in `.env`:
```env
GA_PROPERTY_ID=your_ga4_property_id
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/credentials.json
PORT=3001 # optional, defaults to 3001
DEBUG=true # optional, for debug logging
```

## Available Endpoints

The server provides two ways to access analytics data:

### 1. MCP Endpoint

The MCP endpoint is available at `/mcp` and supports the Model Context Protocol for streaming communication.

Example using the MCP client:

```typescript
import { McpClient } from "@modelcontextprotocol/sdk/client/mcp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Initialize MCP client
const transport = new StreamableHTTPClientTransport({
  url: "http://localhost:3001/mcp"
});
const client = new McpClient();
await client.connect(transport);

// Example: Get URL analytics
const response = await client.callTool("getUrlAnalytics", {
  url: "/about",
  timeframe: "this month",
  trafficSourceLimit: 5
});

console.log(JSON.parse(response.content[0].text));
```

### 2. REST Endpoints

The server also provides traditional REST endpoints for simpler integration:

#### Get URL Analytics
```typescript
// Get comprehensive analytics for a URL
const response = await fetch(
  "http://localhost:3001/getUrlAnalytics?url=/about&timeframe=this+month&trafficSourceLimit=5",
  {
    headers: {
      'Accept': 'application/json'
    }
  }
);
const data = await response.json();
```

#### Get URL Engagement
```typescript
// Get engagement metrics
const response = await fetch(
  "http://localhost:3001/getUrlEngagement?url=/about&timeframe=last+week",
  {
    headers: {
      'Accept': 'application/json'
    }
  }
);
const data = await response.json();
```

#### Get Traffic Sources
```typescript
// Get traffic sources
const response = await fetch(
  "http://localhost:3001/getUrlSourceTraffic?url=/about&timeframe=this+month&limit=10",
  {
    headers: {
      'Accept': 'application/json'
    }
  }
);
const data = await response.json();
```

#### Get Conversions
```typescript
// Get conversion events
const response = await fetch(
  "http://localhost:3001/getUrlConversions?url=/about&timeframe=last+month",
  {
    headers: {
      'Accept': 'application/json'
    }
  }
);
const data = await response.json();
```

## Query Parameters

All endpoints support the following parameters:

- `url` (required): The URL path to analyze (e.g., "/about")
- `timeframe` (optional): Predefined timeframe:
  - "today"
  - "yesterday"
  - "this week"
  - "last week"
  - "this month"
  - "last month"
  - If not specified, defaults to last 30 days
- `startDate` (optional): Custom start date in YYYY-MM-DD format
- `endDate` (optional): Custom end date in YYYY-MM-DD format
- `trafficSourceLimit` (optional, for traffic sources): Maximum number of sources to return (default: 10)

## Response Format

All endpoints return data in the following format:

```typescript
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
      date: string;  // YYYY-MM-DD format
      metrics: T;
    }>;
    monthly: Array<{
      month: string;  // YYYY-MM format
      metrics: T;
    }>;
  };
}
```

Where `T` varies by endpoint:

### URL Analytics Response
```typescript
{
  engagement: {
    averageSessionDuration: number;
    bounceRate: number;
    engagedSessions: number;
    screenPageViewsPerSession: number;
  };
  traffic: Array<{
    source: string;
    medium: string;
    pageViews: number;
    users: number;
  }>;
  conversions: Array<{
    eventName: string;
    count: number;
    conversions: number;
    value: number;
  }>;
}
```

Each response now includes time-based breakdowns of the data:
- `daily`: Metrics broken down by individual days (YYYY-MM-DD format)
- `monthly`: Metrics aggregated by month (YYYY-MM format)

Example response with time breakdown:
```json
{
  "endpoint": "getUrlAnalytics",
  "path": "/about",
  "dateRange": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  },
  "result": {
    "engagement": {
      "averageSessionDuration": 120,
      "bounceRate": 0.45,
      "engagedSessions": 1000,
      "screenPageViewsPerSession": 2.5
    },
    "traffic": [...],
    "conversions": [...]
  },
  "timeBreakdown": {
    "daily": [
      {
        "date": "2024-01-01",
        "metrics": {
          "engagement": {
            "averageSessionDuration": 115,
            "bounceRate": 0.42,
            "engagedSessions": 50,
            "screenPageViewsPerSession": 2.3
          },
          "traffic": [...],
          "conversions": [...]
        }
      },
      // ... more days
    ],
    "monthly": [
      {
        "month": "2024-01",
        "metrics": {
          "engagement": {
            "averageSessionDuration": 120,
            "bounceRate": 0.45,
            "engagedSessions": 1000,
            "screenPageViewsPerSession": 2.5
          },
          "traffic": [...],
          "conversions": [...]
        }
      }
    ]
  }
}
```

## Error Handling

The server returns appropriate HTTP status codes and error messages:

- 400: Bad Request (missing or invalid parameters)
- 404: Not Found
- 500: Internal Server Error

Error responses include a message explaining the error:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

## Development

To start the server in development mode:

```bash
pnpm dev
```

To run tests:

```bash
pnpm test
```

## Debug Logging

Enable debug logging by setting `DEBUG=true` in your environment variables. This will output detailed information about:

- Request parameters
- GA4 API calls
- Session management
- Error details

## License

[MIT](LICENSE) © Adam Harris

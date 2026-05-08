# Model Context Protocol (MCP) Server Development Guide

This guide outlines the best practices, patterns, and structure for creating a new MCP server. Use this as a template for building MCP servers that integrate with any external service.

## Core Principles

1. **Normalized Response Format**
   ```typescript
   interface McpResponse<T> {
     endpoint: string;    // Name of the endpoint that was called
     metadata: {         // Common metadata for all responses
       timestamp: string;
       requestId: string;
       duration: number; // Request duration in milliseconds
       version: string; // API version
       environment: string; // e.g., 'production', 'staging'
       // Add service-specific metadata
     };
     result: T;          // Strongly typed result data
   }
   ```

2. **Error Handling Pattern**
   ```typescript
   interface McpError {
     code: string;       // Machine-readable error code
     message: string;    // Human-readable error message
     details?: unknown;  // Additional error context
     source?: string;    // Origin of the error (e.g., "external_api")
     timestamp: string;  // When the error occurred
     requestId: string;  // For tracking the request that caused the error
     statusCode: number; // HTTP status code
   }
   ```

3. **Standardized Tool Schema**
   ```typescript
   interface McpTool {
     name: string;       // Unique tool identifier
     description: string;// Clear description of the tool's purpose
     parameters: {       // Tool parameters schema
       [key: string]: {
         type: string;
         description: string;
         required: boolean;
         default?: unknown;
         enum?: string[];// For enumerated values
         validation?: unknown; // Additional validation rules
       };
     };
     returns: {         // Return type schema
       type: string;
       description: string;
     };
     rateLimit?: {     // Optional rate limiting config
       requests: number;
       period: number;  // In milliseconds
     };
     caching?: {       // Optional caching config
       ttl: number;    // Time to live in milliseconds
       key: string[];  // Parameters to use in cache key
     };
   }
   ```

## Project Structure

```
├── src/
│   ├── server.ts              # Main server setup
│   ├── config/
│   │   ├── env.ts             # Environment configuration
│   │   ├── validation.ts      # Schema validation
│   │   └── constants.ts       # Shared constants
│   ├── types/
│   │   ├── common.ts          # Shared type definitions
│   │   ├── responses.ts       # Response type definitions
│   │   └── tools.ts          # Tool type definitions
│   ├── services/
│   │   ├── external-api.ts    # External API client
│   │   ├── cache.ts          # Optional caching layer
│   │   ├── rate-limiter.ts   # Rate limiting service
│   │   └── metrics.ts        # Metrics collection
│   ├── tools/
│   │   ├── index.ts          # Tool definitions
│   │   └── handlers/         # Individual tool handlers
│   ├── middleware/
│   │   ├── auth.ts           # Authentication middleware
│   │   ├── validation.ts     # Request validation
│   │   └── error-handler.ts  # Error handling middleware
│   ├── utils/
│   │   ├── date.ts           # Date handling utilities
│   │   ├── logging.ts        # Logging utilities
│   │   └── metrics.ts        # Metrics utilities
│   └── __tests__/            # Test files
│       ├── unit/             # Unit tests
│       ├── integration/      # Integration tests
│       └── fixtures/         # Test fixtures
├── package.json
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest configuration
├── .env.example              # Example environment variables
├── .eslintrc.js             # ESLint configuration
├── .prettierrc              # Prettier configuration
└── README.md                # Project documentation
```

## Implementation Checklist

1. **Environment Setup**
   - [ ] Define required environment variables
   - [ ] Create validation schema
   - [ ] Add environment loading with validation
   - [ ] Set up different configurations for development/staging/production
   ```typescript
   // config/env.ts
   import { z } from 'zod';
   
   export const envSchema = z.object({
     PORT: z.string().transform(Number).default("3000"),
     NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
     LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
     API_VERSION: z.string().default('1.0.0'),
     DEBUG: z.string().optional(),
     EXTERNAL_API_KEY: z.string(),
     EXTERNAL_API_URL: z.string().url(),
     REDIS_URL: z.string().url().optional(),
     // Add service-specific env vars
   });
   
   export const env = envSchema.parse(process.env);
   ```

2. **Type Definitions**
   ```typescript
   // types/common.ts
   export interface PaginationParams {
     limit?: number;
     offset?: number;
     page?: number;
     pageSize?: number;
   }
   
   export interface DateRangeParams {
     startDate?: string;
     endDate?: string;
     timeframe?: string;
     timezone?: string;
   }
   
   export interface SortParams {
     sortBy?: string;
     sortOrder?: 'asc' | 'desc';
   }
   
   // types/responses.ts
   export interface McpResponse<T> {
     endpoint: string;
     metadata: ResponseMetadata;
     result: T;
     pagination?: PaginationMetadata;
   }
   
   export interface ResponseMetadata {
     timestamp: string;
     requestId: string;
     duration: number;
     version: string;
     environment: string;
     [key: string]: unknown;
   }
   
   export interface PaginationMetadata {
     total: number;
     page: number;
     pageSize: number;
     totalPages: number;
     hasMore: boolean;
   }
   ```

3. **External Service Integration**
   ```typescript
   // services/external-api.ts
   export class ExternalApiService {
     private readonly rateLimiter: RateLimiter;
     private readonly cache: CacheService;
     private readonly metrics: MetricsService;
   
     constructor(
       private readonly config: ServiceConfig,
       private readonly logger: Logger
     ) {
       this.rateLimiter = new RateLimiter(config.rateLimit);
       this.cache = new CacheService(config.cache);
       this.metrics = new MetricsService();
     }
   
     async makeRequest<T>(
       endpoint: string,
       params: unknown,
       options: RequestOptions = {}
     ): Promise<T> {
       const startTime = Date.now();
       const requestId = uuid();
   
       try {
         await this.rateLimiter.acquire();
   
         if (options.useCache) {
           const cached = await this.cache.get(this.getCacheKey(endpoint, params));
           if (cached) return cached;
         }
   
         const response = await this.executeRequest<T>(endpoint, params);
   
         if (options.useCache) {
           await this.cache.set(
             this.getCacheKey(endpoint, params),
             response,
             options.cacheTTL
           );
         }
   
         this.metrics.recordSuccess(endpoint, Date.now() - startTime);
         return response;
       } catch (error) {
         this.metrics.recordError(endpoint, error);
         throw this.handleError(error, { requestId, endpoint });
       }
     }
   
     private handleError(error: unknown, context: ErrorContext): McpError {
       // Transform external API errors to MCP format
       const mcpError: McpError = {
         code: this.getErrorCode(error),
         message: this.getErrorMessage(error),
         details: this.getErrorDetails(error),
         source: 'external_api',
         timestamp: new Date().toISOString(),
         requestId: context.requestId,
         statusCode: this.getStatusCode(error)
       };
   
       this.logger.error('External API error', {
         error: mcpError,
         context
       });
   
       return mcpError;
     }
   }
   ```

4. **Tool Implementation Pattern**
   ```typescript
   // tools/handlers/example-tool.ts
   export interface ToolParams {
     query: string;
     filters?: Record<string, unknown>;
     pagination?: PaginationParams;
     sort?: SortParams;
   }
   
   export interface ToolResult {
     items: unknown[];
     metadata?: Record<string, unknown>;
   }
   
   export async function handleExampleTool(
     params: ToolParams,
     context: ToolContext
   ): Promise<McpResponse<ToolResult>> {
     const { service, logger, metrics } = context;
     const startTime = Date.now();
   
     try {
       // Validate parameters
       const validatedParams = await validateToolParams(params);
   
       // Execute the tool logic
       const result = await service.makeRequest<ToolResult>(
         'example-endpoint',
         validatedParams,
         {
           useCache: true,
           cacheTTL: 60000 // 1 minute
         }
       );
   
       // Transform the result if needed
       const transformedResult = transformToolResult(result);
   
       // Return standardized response
       return {
         endpoint: 'example-tool',
         metadata: {
           timestamp: new Date().toISOString(),
           requestId: context.requestId,
           duration: Date.now() - startTime,
           version: context.version,
           environment: context.environment
         },
         result: transformedResult
       };
     } catch (error) {
       logger.error('Tool execution failed', {
         tool: 'example-tool',
         params,
         error
       });
       throw error;
     }
   }
   ```

5. **Tool Registration**
   ```typescript
   // tools/index.ts
   export const tools: Record<string, McpTool> = {
     exampleTool: {
       name: 'exampleTool',
       description: "Clear description of the tool's purpose",
       parameters: {
         query: {
           type: 'string',
           description: 'Search query string',
           required: true,
           validation: {
             minLength: 1,
             maxLength: 100
           }
         },
         filters: {
           type: 'object',
           description: 'Optional filters to apply',
           required: false
         },
         pagination: {
           type: 'object',
           description: 'Pagination parameters',
           required: false,
           default: {
             page: 1,
             pageSize: 20
           }
         }
       },
       returns: {
         type: 'object',
         description: 'Search results with metadata'
       },
       rateLimit: {
         requests: 100,
         period: 60000 // 1 minute
       },
       caching: {
         ttl: 300000, // 5 minutes
         key: ['query', 'filters']
       },
       handler: async (params, context) => {
         return handleExampleTool(params, context);
       }
     }
   };
   ```

## Best Practices

1. **Parameter Validation**
   - Always validate input parameters using Zod or similar
   - Provide clear error messages for invalid inputs
   - Use TypeScript for type safety
   - Implement custom validation rules when needed
   - Sanitize and normalize input data
   ```typescript
   // middleware/validation.ts
   export const validateToolParams = async <T>(
     params: unknown,
     schema: z.ZodSchema<T>
   ): Promise<T> => {
     try {
       return await schema.parseAsync(params);
     } catch (error) {
       if (error instanceof z.ZodError) {
         throw new McpError({
           code: 'INVALID_PARAMS',
           message: 'Invalid parameters provided',
           details: error.errors,
           statusCode: 400
         });
       }
       throw error;
     }
   };
   ```

2. **Error Handling**
   - Catch and transform all external API errors
   - Provide meaningful error messages
   - Include error codes for programmatic handling
   - Log errors with appropriate context
   - Implement retry mechanisms for transient failures
   - Use circuit breakers for external service calls
   ```typescript
   // middleware/error-handler.ts
   export const errorHandler: ErrorRequestHandler = (
     error: Error,
     req: Request,
     res: Response,
     next: NextFunction
   ) => {
     const mcpError = transformError(error);
     
     logger.error('Request failed', {
       error: mcpError,
       request: {
         method: req.method,
         path: req.path,
         params: req.params,
         query: req.query,
         body: req.body
       }
     });
   
     res.status(mcpError.statusCode).json({
       error: mcpError
     });
   };
   ```

3. **Response Formatting**
   - Use consistent response format across all endpoints
   - Include metadata useful for debugging
   - Strong typing for all responses
   - Implement response compression when appropriate
   - Support different response formats (JSON, XML, etc.)
   ```typescript
   // middleware/response-formatter.ts
   export const formatResponse = <T>(
     data: T,
     metadata: ResponseMetadata
   ): McpResponse<T> => {
     return {
       endpoint: metadata.endpoint,
       metadata: {
         ...metadata,
         timestamp: new Date().toISOString()
       },
       result: data
     };
   };
   ```

4. **Testing**
   - Unit tests for each tool handler
   - Integration tests for external API calls
   - Mock external services in tests
   - Performance tests for critical paths
   - Security tests for authentication and authorization
   - API contract tests
   ```typescript
   // __tests__/integration/example-tool.test.ts
   describe('ExampleTool Integration', () => {
     let service: ExternalApiService;
     let context: ToolContext;
   
     beforeEach(() => {
       service = new ExternalApiService(mockConfig);
       context = createTestContext();
       jest.spyOn(service, 'makeRequest');
     });
   
     it('should handle successful requests', async () => {
       const params: ToolParams = {
         query: 'test',
         filters: { status: 'active' }
       };
   
       const result = await handleExampleTool(params, context);
   
       expect(result).toMatchSnapshot();
       expect(service.makeRequest).toHaveBeenCalledWith(
         'example-endpoint',
         expect.objectContaining(params),
         expect.any(Object)
       );
     });
   
     it('should handle rate limiting', async () => {
       // Test implementation
     });
   
     it('should use caching effectively', async () => {
       // Test implementation
     });
   
     it('should handle errors appropriately', async () => {
       // Test implementation
     });
   });
   ```

5. **Documentation**
   - Clear parameter descriptions
   - Example requests and responses
   - Error scenarios and handling
   - Rate limiting information
   - API versioning strategy
   - Authentication requirements
   - Deployment instructions
   - Monitoring and debugging guides

## Performance Considerations

1. **Caching**
   - Implement caching for frequently accessed data
   - Use appropriate cache invalidation strategies
   - Support distributed caching
   - Implement cache warming for critical data
   ```typescript
   // services/cache.ts
   export class CacheService {
     constructor(
       private readonly redis: Redis,
       private readonly config: CacheConfig
     ) {}
   
     async getOrSet<T>(
       key: string,
       getter: () => Promise<T>,
       ttl: number
     ): Promise<T> {
       const cached = await this.get<T>(key);
       if (cached) return cached;
   
       const value = await getter();
       await this.set(key, value, ttl);
       return value;
     }
   
     private getCacheKey(base: string, params: unknown): string {
       return `${base}:${hash(params)}`;
     }
   }
   ```

2. **Parallel Processing**
   - Use Promise.all for concurrent requests
   - Implement batch processing where appropriate
   - Use worker threads for CPU-intensive tasks
   - Implement request queuing for heavy loads
   ```typescript
   // services/batch-processor.ts
   export class BatchProcessor {
     async processBatch<T>(
       items: unknown[],
       processor: (item: unknown) => Promise<T>,
       options: BatchOptions
     ): Promise<T[]> {
       const batches = chunk(items, options.batchSize);
       const results: T[] = [];
   
       for (const batch of batches) {
         const batchResults = await Promise.all(
           batch.map(item => processor(item))
         );
         results.push(...batchResults);
       }
   
       return results;
     }
   }
   ```

3. **Rate Limiting**
   - Implement rate limiting for external API calls
   - Queue requests if necessary
   - Support distributed rate limiting
   - Implement adaptive rate limiting
   ```typescript
   // services/rate-limiter.ts
   export class RateLimiter {
     private readonly redis: Redis;
     private readonly options: RateLimitOptions;
   
     constructor(options: RateLimitOptions) {
       this.redis = new Redis(options.redisUrl);
       this.options = options;
     }
   
     async acquire(): Promise<void> {
       const key = this.getKey();
       const count = await this.redis.incr(key);
   
       if (count === 1) {
         await this.redis.expire(key, this.options.windowSeconds);
       }
   
       if (count > this.options.maxRequests) {
         throw new McpError({
           code: 'RATE_LIMIT_EXCEEDED',
           message: 'Too many requests',
           statusCode: 429
         });
       }
     }
   }
   ```

4. **Monitoring and Metrics**
   - Implement request/response timing
   - Track error rates and types
   - Monitor resource usage
   - Set up alerting for critical issues
   ```typescript
   // services/metrics.ts
   export class MetricsService {
     private readonly metrics: Map<string, Metric>;
   
     constructor() {
       this.metrics = new Map();
     }
   
     recordSuccess(endpoint: string, duration: number): void {
       this.getMetric(endpoint).recordSuccess(duration);
     }
   
     recordError(endpoint: string, error: unknown): void {
       this.getMetric(endpoint).recordError(error);
     }
   
     getMetrics(): MetricsReport {
       const report: MetricsReport = {};
       
       for (const [endpoint, metric] of this.metrics) {
         report[endpoint] = metric.getStats();
       }
   
       return report;
     }
   }
   ```

## Security Considerations

1. **Authentication**
   - Secure storage of API keys
   - Implement token rotation
   - Use environment variables for sensitive data
   - Support multiple auth methods
   ```typescript
   // middleware/auth.ts
   export const authenticate = async (
     req: Request,
     res: Response,
     next: NextFunction
   ): Promise<void> => {
     try {
       const token = extractToken(req);
       const user = await validateToken(token);
       req.user = user;
       next();
     } catch (error) {
       next(new McpError({
         code: 'UNAUTHORIZED',
         message: 'Invalid or missing authentication',
         statusCode: 401
       }));
     }
   };
   ```

2. **Input Validation**
   - Sanitize all inputs
   - Validate parameter types and ranges
   - Prevent injection attacks
   - Implement request size limits
   ```typescript
   // middleware/security.ts
   export const securityMiddleware = [
     helmet(),
     express.json({ limit: '10kb' }),
     sanitizeInput(),
     validateContentType(),
     rateLimit({
       windowMs: 15 * 60 * 1000,
       max: 100
     })
   ];
   ```

3. **Error Exposure**
   - Don't expose internal errors to clients
   - Sanitize error messages
   - Log detailed errors server-side
   - Implement proper error reporting
   ```typescript
   // utils/error-sanitizer.ts
   export const sanitizeError = (error: Error): McpError => {
     if (error instanceof McpError) {
       return {
         ...error,
         details: sanitizeErrorDetails(error.details)
       };
     }
   
     return {
       code: 'INTERNAL_ERROR',
       message: 'An internal error occurred',
       statusCode: 500
     };
   };
   ```

## Deployment and Operations

1. **Configuration Management**
   - Use environment-specific configurations
   - Implement secrets management
   - Support feature flags
   - Version control configurations

2. **Logging and Monitoring**
   - Structured logging
   - Log aggregation
   - Performance monitoring
   - Error tracking
   - Health checks

3. **Scaling and High Availability**
   - Horizontal scaling
   - Load balancing
   - Circuit breakers
   - Failover strategies

4. **Maintenance**
   - Backup strategies
   - Update procedures
   - Rollback plans
   - Documentation

## Example Prompt for New Server

When requesting a new MCP server, provide:

1. **Service Information**
   - Service name and description
   - API documentation links
   - Authentication requirements
   - Rate limiting needs
   - Expected traffic patterns

2. **Endpoint Requirements**
   - List of endpoints needed
   - Parameters for each endpoint
   - Expected response format
   - Error scenarios to handle
   - Performance requirements

3. **Special Requirements**
   - Caching requirements
   - Security considerations
   - Compliance requirements
   - Integration needs
   - Monitoring requirements

Example:
```
Please create an MCP server for [SERVICE_NAME] with the following:

Service Details:
- Description: [SERVICE_DESCRIPTION]
- API Docs: [DOCUMENTATION_URL]
- Auth: [AUTH_TYPE] (e.g., API Key, OAuth2)
- Rate Limit: [LIMIT] requests per [TIME_PERIOD]
- Expected Traffic: [TRAFFIC_PATTERN]

Endpoints:
1. [ENDPOINT_1]
   - Method: [HTTP_METHOD]
   - Path: [PATH]
   - Parameters: [PARAM_LIST]
   - Response: [RESPONSE_FORMAT]
   - Cache TTL: [CACHE_DURATION]
   - Rate Limit: [ENDPOINT_SPECIFIC_LIMIT]

2. [ENDPOINT_2]
   ...

Special Requirements:
- Security: [SECURITY_REQUIREMENTS]
- Compliance: [COMPLIANCE_NEEDS]
- Monitoring: [MONITORING_REQUIREMENTS]
- Integration: [INTEGRATION_DETAILS]
``` 
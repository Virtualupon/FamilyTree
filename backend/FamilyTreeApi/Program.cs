using HealthChecks.UI.Client;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Npgsql;
using Serilog;
using System.Text;
using WebDav;
using FamilyTreeApi.Data;
using FamilyTreeApi.HealthChecks;
using FamilyTreeApi.Mappings;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;
using FamilyTreeApi.Services;
using FamilyTreeApi.Services.Translation;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;
using FamilyTreeApi.Extensions;
using FamilyTreeApi.Services.Caching;
using Polly;
using Polly.Extensions.Http;

// -------------------------------
// BUILDER
// -------------------------------
var builder = WebApplication.CreateBuilder(args);

// Disable legacy timestamp behavior for Npgsql
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

// Kestrel: Unlimited body size (for large media uploads)
builder.WebHost.ConfigureKestrel(opt =>
{
    opt.Limits.MaxRequestBodySize = null;
    opt.ListenAnyIP(8080); // Family Tree API runs on port 8080
});

// Serilog
builder.Host.UseSerilog((context, loggerConfiguration) =>
    loggerConfiguration.ReadFrom.Configuration(context.Configuration));

// Swagger / OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Form options (for large Base64/multipart uploads)
builder.Services.Configure<FormOptions>(options =>
{
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartBodyLengthLimit = int.MaxValue;
});

var services = builder.Services;
var configuration = builder.Configuration;

// -------------------------------
// DATABASE CONTEXT - OPTIMIZED
// -------------------------------
var connectionString = GetConnectionString(configuration);

// Register a shared NpgsqlDataSource as singleton so EF Core and Dapper share ONE connection pool.
var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
var npgsqlDataSource = dataSourceBuilder.Build();
services.AddSingleton(npgsqlDataSource);

// OPTIMIZED: Configure DbContext with shared data source, connection resiliency, and NoTracking default
services.AddDbContext<ApplicationDbContext>((serviceProvider, options) =>
{
    options.UseNpgsql(npgsqlDataSource, npgsqlOptions =>
    {
        // Enable automatic retry on transient failures
        npgsqlOptions.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorCodesToAdd: null);

        // Command timeout (30 seconds)
        npgsqlOptions.CommandTimeout(30);

        // Use relational nulls for better SQL translation
        npgsqlOptions.UseRelationalNulls();
    });

    // CRITICAL FIX: Default to NoTracking for better performance
    // Services that need change tracking should use .AsTracking() explicitly
    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);

    // Only enable detailed logging in development
    if (builder.Environment.IsDevelopment())
    {
        options.EnableSensitiveDataLogging();
        options.EnableDetailedErrors();
    }
});

// -------------------------------
// ASP.NET IDENTITY
// -------------------------------
var identityOptions = configuration.GetSection("IdentityOptions");

services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
{
    // Sign-in options
    var signInOptions = identityOptions.GetSection("signInOptions");
    options.SignIn.RequireConfirmedAccount = signInOptions.GetValue<bool>("RequireConfirmedAccount");
    options.SignIn.RequireConfirmedEmail = signInOptions.GetValue<bool>("RequireConfirmedEmail");
    options.SignIn.RequireConfirmedPhoneNumber = signInOptions.GetValue<bool>("RequireConfirmedPhoneNumber");

    // User options
    var userOptions = identityOptions.GetSection("userOptions");
    options.User.RequireUniqueEmail = userOptions.GetValue<bool>("requireUniqueEmail");

    // Lockout options
    var lockoutOptions = identityOptions.GetSection("lockoutOptions");
    options.Lockout.AllowedForNewUsers = lockoutOptions.GetValue<bool>("AllowedForNewUsers");
    options.Lockout.MaxFailedAccessAttempts = lockoutOptions.GetValue<int>("MaxFailedAccessAttempts");
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.Parse(lockoutOptions.GetValue<string>("DefaultLockoutTimeSpan") ?? "00:30:00");

    // Password options
    var passwordOptions = identityOptions.GetSection("passwordOptions");
    options.Password.RequireDigit = passwordOptions.GetValue<bool>("RequireDigit");
    options.Password.RequireLowercase = passwordOptions.GetValue<bool>("RequireLowercase");
    options.Password.RequireUppercase = passwordOptions.GetValue<bool>("RequireUppercase");
    options.Password.RequireNonAlphanumeric = passwordOptions.GetValue<bool>("RequireNonAlphanumeric");
    options.Password.RequiredLength = passwordOptions.GetValue<int>("RequiredLength");
    options.Password.RequiredUniqueChars = passwordOptions.GetValue<int>("RequiredUniqueChars");
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders();

// -------------------------------
// JWT AUTHENTICATION
// -------------------------------
var jwtSettings = configuration.GetSection("JwtSettings");
var validationParams = jwtSettings.GetSection("validationParameters");
var tokenOptions = jwtSettings.GetSection("tokenOptions");

var bearerTokenKey = tokenOptions.GetValue<string>("bearerTokenKeyStr")
    ?? throw new InvalidOperationException("JWT bearer token key not configured");

services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = "Bearer";
    options.DefaultChallengeScheme = "Bearer";
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
    {
        ValidateIssuer = validationParams.GetValue<bool>("ValidateIssuer"),
        ValidateAudience = validationParams.GetValue<bool>("ValidateAudience"),
        ValidateLifetime = validationParams.GetValue<bool>("ValidateLifetime"),
        ValidateIssuerSigningKey = validationParams.GetValue<bool>("ValidateIssuerSigningKey"),
        ValidIssuer = validationParams.GetValue<string>("ValidIssuer"),
        ValidAudience = validationParams.GetValue<string>("ValidAudience"),
        ClockSkew = TimeSpan.FromMinutes(validationParams.GetValue<int>("ClockSkew")),
        IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(bearerTokenKey))
    };

    // Read JWT from HttpOnly cookie instead of Authorization header
    options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            // Try cookie first, then fall back to Authorization header for backward compatibility
            var accessToken = context.Request.Cookies["access_token"];
            if (!string.IsNullOrEmpty(accessToken))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

services.AddAuthorization();

// -------------------------------
// REDIS CACHE (Optional)
// -------------------------------
var redisConfig = configuration.GetSection("Redis");
var redisEnabled = redisConfig.GetValue<bool>("Enabled");
var redisConnectionString = redisConfig.GetValue<string>("ConnectionString");
var redisInstanceName = redisConfig.GetValue<string>("InstanceName");

if (redisEnabled)
{
    services.AddStackExchangeRedisCache(options =>
    {
        options.InstanceName = redisInstanceName;
        options.Configuration = redisConnectionString;
    });
}
else
{
    services.AddDistributedMemoryCache();
}

// Add in-memory cache for local caching (used by FamilyRelationshipTypeService)
services.AddMemoryCache();

// -------------------------------
// HEALTH CHECKS - CRITICAL FIX
// -------------------------------
// BEFORE (PROBLEMATIC - creates separate connection pool):
// services.AddHealthChecks()
//     .AddNpgSql(connectionString);  // ❌ DON'T USE THIS - Creates separate pool!

// AFTER (FIXED - uses DbContext's connection pool):
services.AddHealthChecks()
    .AddDbContextCheck<ApplicationDbContext>(
        name: "database",
        failureStatus: HealthStatus.Unhealthy,
        tags: new[] { "db", "sql", "postgres" });

// Only add Redis health check if enabled
if (redisConfig.GetValue<bool>("Enabled"))
{
    var redisConnection = redisConfig.GetValue<string>("ConnectionString");
    if (!string.IsNullOrEmpty(redisConnection))
    {
        services.AddHealthChecks()
            .AddRedis(redisConnection, name: "redis", tags: new[] { "cache", "redis" });
    }
}

// Add LibreTranslate health check
services.AddHealthChecks()
    .AddCheck<LibreTranslateHealthCheck>(
        name: "libretranslate",
        failureStatus: HealthStatus.Degraded,
        tags: new[] { "translation", "external" });

// -------------------------------
// CORS
// -------------------------------
var allowedOrigins = configuration["Cors"]?
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? new[]
    {
        "http://localhost:4200",
        "https://localhost:4200",
        "http://localhost:5000",
        "https://localhost:5000",
        "https://localhost:7155"
    };

services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// -------------------------------
// CONTROLLERS
// -------------------------------
services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        // Serialize enums as strings (e.g., "Image" instead of 0) for frontend compatibility
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
services.AddHttpContextAccessor();

// -------------------------------
// SECURITY SERVICES (Email Verification, Rate Limiting)
// -------------------------------
services.Configure<RateLimitConfiguration>(configuration.GetSection(RateLimitConfiguration.SectionName));
services.Configure<EmailConfiguration>(configuration.GetSection(EmailConfiguration.SectionName));
services.AddSingleton<ISecureCryptoService, SecureCryptoService>();
services.AddScoped<IRateLimitService, RateLimitService>();
services.AddScoped<IEmailService, EmailService>();

// -------------------------------
// FAMILY TREE SERVICES
// -------------------------------
services.AddScoped<IAuthService, AuthService>();
services.AddScoped<IMediaService, MediaService>();
services.AddScoped<IGedcomService, GedcomService>();
services.AddScoped<IPersonService, PersonService>();
services.AddScoped<IUnionService, UnionService>();
services.AddScoped<IParentChildService, ParentChildService>();
services.AddScoped<ITreeViewService, TreeViewService>();
services.AddScoped<IFamilyTreeService, FamilyTreeService>();
services.AddScoped<IPersonLinkService, PersonLinkService>();
services.AddScoped<ITownService, TownService>();
services.AddScoped<IAdminService, AdminService>();
services.AddScoped<IAnalyticsService, AnalyticsService>();
services.AddScoped<IMediaManagementService, MediaManagementService>();
services.AddScoped<IPersonMediaService, PersonMediaService>();
services.AddScoped<IFamilyRelationshipTypeService, FamilyRelationshipTypeService>();
services.AddSingleton<IRelationshipTypeMappingService, RelationshipTypeMappingService>();
services.AddScoped<IFamilyService, FamilyService>();  // Family groups (Town->Org->Family->Person)
services.AddScoped<IFileStorageService, LocalFileStorageService>();
services.AddScoped<INameTransliterationService, NameTransliterationService>();
services.AddScoped<IMediaTranslationService, MediaTranslationService>();
services.AddScoped<ICountryService, CountryService>();
services.AddScoped<ICarouselImageService, CarouselImageService>();
services.AddScoped<ITownImageService, TownImageService>();

// Governance Model Services
services.AddScoped<IAuditLogService, AuditLogService>();
services.AddScoped<ISuggestionService, SuggestionService>();

// Support Ticket System
services.AddScoped<ISupportTicketService, SupportTicketService>();

// Cache Infrastructure Services
services.AddSingleton<ICacheOptionsProvider, CacheOptionsProvider>();
services.AddSingleton<IResilientCacheService, ResilientCacheService>();
services.AddScoped<ITreeCacheService, TreeCacheService>();

// Storage Migration Service (Singleton - has instance state for progress tracking)
services.AddSingleton<IStorageMigrationService, StorageMigrationService>();

// Notes Service (centralized entity notes)
services.AddScoped<INoteService, NoteService>();

// Duplicate Detection Services
services.AddScoped<IDuplicateDetectionRepository, DuplicateDetectionRepository>();
services.AddScoped<IDuplicateDetectionService, DuplicateDetectionService>();

// Relationship Prediction Services
services.AddScoped<FamilyTreeApi.Services.Prediction.Rules.IPredictionRule, FamilyTreeApi.Services.Prediction.Rules.SpouseChildGapRule>();
services.AddScoped<FamilyTreeApi.Services.Prediction.Rules.IPredictionRule, FamilyTreeApi.Services.Prediction.Rules.MissingUnionRule>();
services.AddScoped<FamilyTreeApi.Services.Prediction.Rules.IPredictionRule, FamilyTreeApi.Services.Prediction.Rules.SiblingParentGapRule>();
services.AddScoped<FamilyTreeApi.Services.Prediction.Rules.IPredictionRule, FamilyTreeApi.Services.Prediction.Rules.PatronymicNameRule>();
services.AddScoped<FamilyTreeApi.Services.Prediction.Rules.IPredictionRule, FamilyTreeApi.Services.Prediction.Rules.AgeFamilyRule>();
services.AddScoped<FamilyTreeApi.Services.Prediction.IRelationshipPredictionService, FamilyTreeApi.Services.Prediction.RelationshipPredictionService>();

// -------------------------------
// TRANSLATION SERVICES
// -------------------------------
// Configure LibreTranslate settings
services.Configure<LibreTranslateConfiguration>(configuration.GetSection(LibreTranslateConfiguration.SectionName));

// Get LibreTranslate config for HTTP client setup
var libreTranslateConfig = configuration.GetSection(LibreTranslateConfiguration.SectionName)
    .Get<LibreTranslateConfiguration>() ?? new LibreTranslateConfiguration();

// Register LibreTranslate HTTP client with Polly resilience policies
services.AddHttpClient<ILibreTranslateService, LibreTranslateService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(libreTranslateConfig.TimeoutSeconds);
})
.AddPolicyHandler(GetRetryPolicy(libreTranslateConfig.RetryCount))
.AddPolicyHandler(GetCircuitBreakerPolicy(
    libreTranslateConfig.CircuitBreakerFailureThreshold,
    libreTranslateConfig.CircuitBreakerDurationSeconds));

// Register translation services
services.AddScoped<INobiinTranslationService, NobiinAITranslationService>();
services.AddScoped<ITextTranslationService, TextTranslationService>();

// Polly policy factory methods
static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy(int retryCount) =>
    HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(retryCount, retryAttempt =>
            TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));

static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy(int failureThreshold, int durationSeconds) =>
    HttpPolicyExtensions
        .HandleTransientHttpError()
        .CircuitBreakerAsync(failureThreshold, TimeSpan.FromSeconds(durationSeconds));

// -------------------------------
// REPOSITORIES
// -------------------------------
services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
services.AddScoped<IPersonRepository, PersonRepository>();
services.AddScoped<IOrgRepository, OrgRepository>();
services.AddScoped<IUnionRepository, UnionRepository>();
services.AddScoped<IPersonMediaRepository, PersonMediaRepository>();
services.AddScoped<ITownImageRepository, TownImageRepository>();

// Governance Model Repositories
services.AddScoped<ISuggestionRepository, SuggestionRepository>();
services.AddScoped<ISuggestionEvidenceRepository, SuggestionEvidenceRepository>();
services.AddScoped<ISuggestionCommentRepository, SuggestionCommentRepository>();

services.AddSearchServices();

// -------------------------------
// AUTOMAPPER
// -------------------------------
services.AddAutoMapper(typeof(MappingProfile));

// -------------------------------
// STORAGE CONFIGURATION
// -------------------------------
// Storage abstraction using VirtualUpon.Storage library
services.Configure<StorageConfiguration>(configuration.GetSection("StorageConfiguration"));
services.AddSingleton(resolver => resolver.GetRequiredService<IOptions<StorageConfiguration>>().Value);

// -------------------------------
// STORAGE SERVICE FACTORY (VirtualUpon.Storage)
// -------------------------------
services.AddScoped<VirtualUpon.Storage.Factories.IStorageService>(provider =>
{
    var config = provider.GetRequiredService<IConfiguration>()
        .GetSection("StorageConfiguration").Get<StorageConfiguration>()
        ?? throw new InvalidOperationException("Storage configuration missing.");

    int storageTypeInt = VirtualUpon.Storage.Utilities.StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);
    var cache = provider.GetService<IDistributedCache>();

    return storageTypeInt switch
    {
        1 => VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLocalStorageService(config, cache),
        2 => ValidateLinodeConfig(config) ? VirtualUpon.Storage.Factories.StorageServiceFactory.CreateLinodeStorageService(config, cache) : throw new InvalidOperationException("Invalid Linode config"),
        3 => ValidateAwsConfig(config) ? VirtualUpon.Storage.Factories.StorageServiceFactory.CreateAwsStorageService(config, cache) : throw new InvalidOperationException("Invalid AWS config"),
        4 => ValidateNextcloudConfig(config) ? VirtualUpon.Storage.Factories.StorageServiceFactory.CreateNextCloudStorageService(config, new WebDavClient(), new HttpClient(), cache) : throw new InvalidOperationException("Invalid Nextcloud config"),
        5 => ValidateCloudflareConfig(config) ? VirtualUpon.Storage.Factories.StorageServiceFactory.CreateCloudflareStorageService(config, cache) : throw new InvalidOperationException("Invalid Cloudflare config"),
        _ => throw new ArgumentException($"Unsupported storage type: {config.StorageType}")
    };
});

bool ValidateAwsConfig(StorageConfiguration c) => !string.IsNullOrEmpty(c.AWS?.AccessKey) && !string.IsNullOrEmpty(c.AWS.SecretKey) && !string.IsNullOrEmpty(c.AWS.Region) && !string.IsNullOrEmpty(c.AWS.BucketName);
bool ValidateLinodeConfig(StorageConfiguration c) => !string.IsNullOrEmpty(c.Linode?.AccessKey) && !string.IsNullOrEmpty(c.Linode.SecretKey) && !string.IsNullOrEmpty(c.Linode.S3Endpoint) && !string.IsNullOrEmpty(c.Linode.BucketName);
bool ValidateNextcloudConfig(StorageConfiguration c) => !string.IsNullOrEmpty(c.Nextcloud?.Username) && !string.IsNullOrEmpty(c.Nextcloud.Password) && !string.IsNullOrEmpty(c.Nextcloud.BaseUrl);
bool ValidateCloudflareConfig(StorageConfiguration c) => !string.IsNullOrEmpty(c.Cloudflare?.AccountId) && !string.IsNullOrEmpty(c.Cloudflare.AccessKey) && !string.IsNullOrEmpty(c.Cloudflare.SecretKey) && !string.IsNullOrEmpty(c.Cloudflare.BucketName);

// -------------------------------
// BUILD APP
// -------------------------------
var app = builder.Build();

// -------------------------------
// DATABASE INITIALIZATION
// -------------------------------
using (var scope = app.Services.CreateScope())
{
    var scopedServices = scope.ServiceProvider;
    try
    {
        var context = scopedServices.GetRequiredService<ApplicationDbContext>();

        // Enable pg_trgm extension for full-text search
        await context.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS pg_trgm");

        // Create database schema
        await context.Database.EnsureCreatedAsync();

        // Apply SQL migration scripts (idempotent — safe to re-run)
        await ApplySqlScriptsAsync(context, app.Logger);

        // Seed initial data
        await SeedDataAsync(scopedServices);

        app.Logger.LogInformation("Family Tree database initialized successfully.");
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "An error occurred while initializing the Family Tree database.");
        throw;
    }
}

// Initialize RelationshipTypeMappingService after database is ready
var mappingService = app.Services.GetRequiredService<IRelationshipTypeMappingService>();
await mappingService.InitializeAsync();

// -------------------------------
// VERIFY REDIS CONNECTION
// -------------------------------
if (redisEnabled)
{
    app.Logger.LogInformation("Redis cache ENABLED - Connecting to {ConnectionString} with instance {InstanceName}",
        redisConnectionString, redisInstanceName);

    try
    {
        var cache = app.Services.GetRequiredService<IDistributedCache>();
        var testKey = "startup:connection-test";
        var testValue = DateTime.UtcNow.ToString("O");

        await cache.SetStringAsync(testKey, testValue, new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10)
        });

        var readBack = await cache.GetStringAsync(testKey);

        if (readBack == testValue)
        {
            app.Logger.LogInformation("Redis connection VERIFIED - Successfully connected");
        }
        else
        {
            app.Logger.LogWarning("Redis connection PARTIAL - Write succeeded but read returned different value");
        }

        await cache.RemoveAsync(testKey);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Redis connection FAILED - Could not connect. Cache operations will fail until Redis is available.");
    }
}
else
{
    app.Logger.LogInformation("Redis cache DISABLED - Using in-memory distributed cache");
}

// -------------------------------
// MIDDLEWARE PIPELINE
// -------------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler(errorApp =>
    {
        errorApp.Run(async context =>
        {
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
            if (error != null)
            {
                var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
                logger.LogError(error.Error, "Unhandled exception");
                await context.Response.WriteAsJsonAsync(new { error = error.Error.Message });
            }
        });
    });
}

// ForwardedHeaders MUST be first — before routing, auth, and any middleware that reads client IP
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

//app.UseHttpsRedirection();
app.UseCors();

// -------------------------------
// STATIC FILES FOR MEDIA STORAGE
// -------------------------------
// Serve uploaded media files from /uploads path
var storageConfig = app.Services.GetRequiredService<StorageConfiguration>();
var mediaBasePath = storageConfig.LocalStorage?.BasePath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");

// Ensure media directory exists
if (!Directory.Exists(mediaBasePath))
{
    Directory.CreateDirectory(mediaBasePath);
    app.Logger.LogInformation("Created media storage directory: {Path}", mediaBasePath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaBasePath),
    RequestPath = "/uploads",
    OnPrepareResponse = ctx =>
    {
        // Cache static files for 1 day
        ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=86400");
    }
});

app.Logger.LogInformation("Static files configured. Serving media from {Path} at /uploads", mediaBasePath);

app.UseSerilogRequestLogging();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Health checks endpoint
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

// Simple status endpoint
app.MapGet("/", () => Results.Ok(new
{
    application = "Family Tree API",
    version = "1.0.0",
    status = "healthy",
    timestamp = DateTime.UtcNow
}))
.WithName("Status")
.WithOpenApi();

// -------------------------------
// RUN
// -------------------------------
app.Logger.LogInformation("Family Tree API starting on port 8080...");
app.Run();

// -------------------------------
// HELPER METHODS
// -------------------------------

static string GetConnectionString(IConfiguration configuration)
{
    // First, try the "default" connection string from appsettings
    var connString = configuration.GetConnectionString("default");

    if (!string.IsNullOrWhiteSpace(connString))
    {
        return connString;
    }

    // Fallback to DATABASE_URL environment variable (Replit/Heroku style)
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");

    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return ConvertPostgresUrlToConnectionString(databaseUrl);
    }

    throw new InvalidOperationException(
        "Database connection string not found. Please configure 'default' in ConnectionStrings or set DATABASE_URL environment variable.");
}

static string ConvertPostgresUrlToConnectionString(string databaseUrl)
{
    var uri = new Uri(databaseUrl);

    var userInfo = uri.UserInfo.Split(':');
    var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";

    // OPTIMIZED: Better connection pooling settings for Npgsql 8.x
    var connBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = username,
        Password = password,

        // Connection Pooling - OPTIMIZED settings
        Pooling = true,
        MinPoolSize = 1,               // Reduced - less idle connections
        MaxPoolSize = 15,              // Reduced from 20 - prevent exhaustion
        ConnectionIdleLifetime = 120,  // Reduced from 300 - faster cleanup (2 min)
        ConnectionPruningInterval = 10, // Actively prune idle connections every 10s

        // Timeouts
        Timeout = 30,                  // Connection timeout
        CommandTimeout = 30            // Command timeout
    };

    // Add Keepalive via string (works across all Npgsql versions)
    connBuilder["Keepalive"] = 15;

    if (!string.IsNullOrEmpty(uri.Query))
    {
        var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);

        foreach (var param in query)
        {
            if (param.Key.Equals("ssl", StringComparison.OrdinalIgnoreCase) &&
                param.Value.ToString().Equals("true", StringComparison.OrdinalIgnoreCase))
            {
                connBuilder.SslMode = SslMode.Require;
            }
        }
    }

    return connBuilder.ToString();
}

static async Task SeedDataAsync(IServiceProvider services)
{
    var context = services.GetRequiredService<ApplicationDbContext>();
    var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
    var roleManager = services.GetRequiredService<RoleManager<ApplicationRole>>();
    var logger = services.GetRequiredService<ILogger<Program>>();

    // Seed Identity roles
    var systemRoles = new[] { "Developer", "SuperAdmin", "Admin", "User" };
    foreach (var roleName in systemRoles)
    {
        if (!await roleManager.RoleExistsAsync(roleName))
        {
            await roleManager.CreateAsync(new ApplicationRole { Name = roleName });
            logger.LogInformation("Created Identity role: {Role}", roleName);
        }
    }

    // Get or create default organization
    var org = await context.Orgs.OrderBy(o => o.CreatedAt).FirstOrDefaultAsync();
    if (org == null)
    {
        org = new Org
        {
            Id = Guid.NewGuid(),
            Name = "Smith Family Tree",
            Description = "Demo family tree for the Smith family",
            SettingsJson = "{\"defaultLanguage\":\"en\",\"supportedLanguages\":[\"en\",\"ar\",\"nob\"]}",
            IsPublic = false,
            AllowCrossTreeLinking = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        context.Orgs.Add(org);
        await context.SaveChangesAsync();
        logger.LogInformation("Created default organization: {OrgName}", org.Name);
    }

    // Get or create admin user
    var adminUser = await userManager.FindByEmailAsync("admin@familytree.demo");
    if (adminUser == null)
    {
        adminUser = new ApplicationUser
        {
            UserName = "admin@familytree.demo",
            Email = "admin@familytree.demo",
            FirstName = "Admin",
            LastName = "User",
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(adminUser, "Demo123!");
        if (!result.Succeeded)
        {
            throw new Exception($"Failed to create admin user: {string.Join(", ", result.Errors.Select(e => e.Description))}");
        }

        // Assign SuperAdmin role
        await userManager.AddToRoleAsync(adminUser, "SuperAdmin");
        logger.LogInformation("Created admin user with SuperAdmin role: {Email}", adminUser.Email);
    }
    else if (!await userManager.IsInRoleAsync(adminUser, "SuperAdmin"))
    {
        // Upgrade existing admin to SuperAdmin if not already
        await userManager.AddToRoleAsync(adminUser, "SuperAdmin");
        logger.LogInformation("Assigned SuperAdmin role to admin user: {Email}", adminUser.Email);
    }

    // Set org owner if not set
    if (org.OwnerId == null)
    {
        org.OwnerId = adminUser.Id;
        await context.SaveChangesAsync();
    }

    // Ensure admin user is linked to organization
    var orgUserExists = await context.OrgUsers
        .AnyAsync(ou => ou.UserId == adminUser.Id && ou.OrgId == org.Id);

    if (!orgUserExists)
    {
        context.OrgUsers.Add(new OrgUser
        {
            OrgId = org.Id,
            UserId = adminUser.Id,
            Role = OrgRole.Owner,
            JoinedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();
        logger.LogInformation("Linked admin user to organization as Owner");
    }

    // Create sample person if none exist
    if (!await context.People.AnyAsync())
    {
        var person = new Person
        {
            Id = Guid.NewGuid(),
            OrgId = org.Id,
            Sex = Sex.Male,
            BirthDate = new DateTime(1940, 5, 15),
            BirthPrecision = DatePrecision.Exact,
            PrivacyLevel = PrivacyLevel.Public,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            NameEnglish = "William Smith"
        };
        context.People.Add(person);

        await context.SaveChangesAsync();
        logger.LogInformation("Created sample person: {Name}", person.PrimaryName);
    }
}

static async Task ApplySqlScriptsAsync(ApplicationDbContext context, Microsoft.Extensions.Logging.ILogger logger)
{
    // SQL scripts that must be applied/re-applied on startup.
    // These use CREATE OR REPLACE / DROP IF EXISTS so they are idempotent.
    var scriptsToApply = new[]
    {
        "025_FixSearchSoftDelete.sql",
        "029_EnhanceRelationshipFinding.sql",
        "030_DetectDuplicateCandidates.sql",
        "032_CreatePredictedRelationships.sql",
        "033_StandardizeNotesToTable.sql"
    };

    // Try multiple possible locations for the Scripts folder
    var possibleBases = new[]
    {
        AppContext.BaseDirectory,                    // bin/Debug/net8.0/
        Directory.GetCurrentDirectory(),             // project root when running with dotnet run
        Path.Combine(AppContext.BaseDirectory, "..","..","..") // navigate up from bin/Debug/net8.0
    };

    string? scriptsDir = null;
    foreach (var basePath in possibleBases)
    {
        var candidate = Path.Combine(basePath, "Scripts");
        if (Directory.Exists(candidate))
        {
            scriptsDir = candidate;
            break;
        }
    }

    if (scriptsDir == null)
    {
        logger.LogWarning("SQL Scripts directory not found. Skipping SQL migration scripts. Searched in: {Paths}",
            string.Join(", ", possibleBases.Select(b => Path.Combine(b, "Scripts"))));
        return;
    }

    logger.LogInformation("Applying SQL migration scripts from: {ScriptsDir}", scriptsDir);

    foreach (var scriptName in scriptsToApply)
    {
        var scriptPath = Path.Combine(scriptsDir, scriptName);
        if (!File.Exists(scriptPath))
        {
            logger.LogDebug("SQL script not found, skipping: {Script}", scriptName);
            continue;
        }

        try
        {
            var sql = await File.ReadAllTextAsync(scriptPath);
            await context.Database.ExecuteSqlRawAsync(sql);
            logger.LogInformation("Applied SQL script: {Script}", scriptName);
        }
        catch (Exception ex)
        {
            // Log but don't fail startup — the functions may already exist
            logger.LogWarning(ex, "Failed to apply SQL script {Script}. This may be expected if the functions already exist.", scriptName);
        }
    }
}
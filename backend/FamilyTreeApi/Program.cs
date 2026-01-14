using HealthChecks.UI.Client;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Npgsql;
using Serilog;
using System.Text;
using WebDav;
using FamilyTreeApi.Data;
using FamilyTreeApi.Mappings;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;
using FamilyTreeApi.Services;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;
using FamilyTreeApi.Extensions;

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

// OPTIMIZED: Configure DbContext with connection resiliency, pooling, and NoTracking default
services.AddDbContext<ApplicationDbContext>((serviceProvider, options) =>
{
    options.UseNpgsql(connectionString, npgsqlOptions =>
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
});

services.AddAuthorization();

// -------------------------------
// REDIS CACHE (Optional)
// -------------------------------
var redisConfig = configuration.GetSection("Redis");
if (redisConfig.GetValue<bool>("Enabled"))
{
    services.AddStackExchangeRedisCache(options =>
    {
        options.InstanceName = redisConfig.GetValue<string>("InstanceName");
        options.Configuration = redisConfig.GetValue<string>("ConnectionString");
    });
}
else
{
    // Use in-memory cache if Redis is disabled
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
    });
services.AddHttpContextAccessor();

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
services.AddScoped<IMediaManagementService, MediaManagementService>();
services.AddScoped<IPersonMediaService, PersonMediaService>();
services.AddScoped<IFamilyRelationshipTypeService, FamilyRelationshipTypeService>();
services.AddScoped<IFamilyService, FamilyService>();  // Family groups (Town->Org->Family->Person)
services.AddScoped<IFileStorageService, LocalFileStorageService>();
services.AddScoped<INameTransliterationService, NameTransliterationService>();
services.AddScoped<ICountryService, CountryService>();

// -------------------------------
// REPOSITORIES
// -------------------------------
services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
services.AddScoped<IPersonRepository, PersonRepository>();
services.AddScoped<IOrgRepository, OrgRepository>();
services.AddScoped<IUnionRepository, UnionRepository>();
services.AddScoped<IPersonMediaRepository, PersonMediaRepository>();

services.AddSearchServices();

// -------------------------------
// AUTOMAPPER
// -------------------------------
services.AddAutoMapper(typeof(MappingProfile));

// -------------------------------
// STORAGE CONFIGURATION
// -------------------------------
// NOTE: Requires VirtualUpon.Storage library (custom library from your Nobiin Dictionary baseline)
// Add the library as a project/package reference in Visual Studio 2022 to remove LSP errors
services.Configure<StorageConfiguration>(configuration.GetSection("StorageConfiguration"));
services.AddSingleton(resolver => resolver.GetRequiredService<IOptions<StorageConfiguration>>().Value);

// -------------------------------
// STORAGE SERVICE FACTORY
// -------------------------------
services.AddScoped<IStorageService>(provider =>
{
    var config = provider.GetRequiredService<IConfiguration>()
        .GetSection("StorageConfiguration").Get<StorageConfiguration>()
        ?? throw new InvalidOperationException("Storage configuration missing.");

    int storageTypeInt = StorageTypeHelper.ConvertStorageTypeToInt(config.StorageType);
    var cache = provider.GetService<IDistributedCache>();

    return storageTypeInt switch
    {
        1 => StorageServiceFactory.CreateLocalStorageService(config, cache),
        2 => ValidateLinodeConfig(config) ? StorageServiceFactory.CreateLinodeStorageService(config, cache) : throw new InvalidOperationException("Invalid Linode config"),
        3 => ValidateAwsConfig(config) ? StorageServiceFactory.CreateAwsStorageService(config, cache) : throw new InvalidOperationException("Invalid AWS config"),
        4 => ValidateNextcloudConfig(config) ? StorageServiceFactory.CreateNextCloudStorageService(config, new WebDavClient(), new HttpClient(), cache) : throw new InvalidOperationException("Invalid Nextcloud config"),
        5 => ValidateCloudflareConfig(config) ? StorageServiceFactory.CreateCloudflareStorageService(config, cache) : throw new InvalidOperationException("Invalid Cloudflare config"),
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

//app.UseHttpsRedirection();
app.UseCors();

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

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

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
    var systemRoles = new[] { "SuperAdmin", "Admin", "User" };
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
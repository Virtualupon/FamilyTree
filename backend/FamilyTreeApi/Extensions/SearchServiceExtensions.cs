// FamilyTreeApi/Extensions/SearchServiceExtensions.cs
#nullable enable
using Microsoft.Extensions.DependencyInjection;
using FamilyTreeApi.Repositories.Implementations;
using FamilyTreeApi.Repositories.Interfaces;
using FamilyTreeApi.Services.Implementations;
using FamilyTreeApi.Services.Interfaces;

namespace FamilyTreeApi.Extensions;

/// <summary>
/// Extension methods for registering search-related services.
/// </summary>
public static class SearchServiceExtensions
{
    /// <summary>
    /// Adds Dapper-based search repositories and services to the DI container.
    /// </summary>
    /// <param name="services">The service collection</param>
    /// <returns>The service collection for chaining</returns>
    public static IServiceCollection AddSearchServices(this IServiceCollection services)
    {
        // Register Dapper repository (transient because it uses connection per request)
        services.AddTransient<IPersonSearchRepository, PersonSearchRepository>();

        // Register service layer
        services.AddScoped<IPersonSearchService, PersonSearchService>();

        return services;
    }
}
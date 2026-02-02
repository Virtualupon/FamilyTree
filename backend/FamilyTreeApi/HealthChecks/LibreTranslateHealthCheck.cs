using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Services.Translation;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace FamilyTreeApi.HealthChecks;

/// <summary>
/// Health check for LibreTranslate service availability.
/// </summary>
public class LibreTranslateHealthCheck : IHealthCheck
{
    private readonly ILibreTranslateService _libreTranslate;
    private readonly LibreTranslateConfiguration _config;

    public LibreTranslateHealthCheck(
        ILibreTranslateService libreTranslate,
        IOptions<LibreTranslateConfiguration> options)
    {
        _libreTranslate = libreTranslate;
        _config = options.Value;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        if (!_config.Enabled)
        {
            return HealthCheckResult.Healthy("LibreTranslate is disabled, using AI fallback");
        }

        try
        {
            var isAvailable = await _libreTranslate.IsAvailableAsync(cancellationToken);

            if (isAvailable)
            {
                return HealthCheckResult.Healthy($"LibreTranslate is available at {_config.BaseUrl}");
            }

            return HealthCheckResult.Degraded(
                $"LibreTranslate at {_config.BaseUrl} is not responding. Using AI fallback.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Degraded(
                $"LibreTranslate health check failed: {ex.Message}. Using AI fallback.",
                ex);
        }
    }
}

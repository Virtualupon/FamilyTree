// File: Services/PersonService.cs
using AutoMapper;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Person service implementation containing all business logic.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly.
/// Auto-transliterates names to Arabic, English, and Nobiin when created.
/// </summary>
public class PersonService : IPersonService
{
    private readonly IPersonRepository _personRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly INameTransliterationService? _transliterationService;
    private readonly IMediaService _mediaService;
    private readonly IMapper _mapper;
    private readonly ILogger<PersonService> _logger;

    // Allowed MIME types for avatars
    private static readonly string[] AllowedAvatarMimeTypes =
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };

    // Max avatar file size: 5 MB
    private const long MaxAvatarSizeBytes = 5L * 1024 * 1024;

    public PersonService(
        IPersonRepository personRepository,
        IOrgRepository orgRepository,
        IMediaService mediaService,
        IMapper mapper,
        ILogger<PersonService> logger,
        INameTransliterationService? transliterationService = null)
    {
        _personRepository = personRepository;
        _orgRepository = orgRepository;
        _mediaService = mediaService;
        _mapper = mapper;
        _logger = logger;
        _transliterationService = transliterationService;
    }

    // ============================================================================
    // PERSON OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<PagedResult<PersonListItemDto>>> GetPersonsAsync(
        PersonSearchDto search,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetPersons called: TreeId={TreeId}, TownId={TownId}, Page={Page}, PageSize={PageSize}",
                search.TreeId, search.TownId, search.Page, search.PageSize);

            List<PersonListItemDto> items;
            int totalCount;

            // If TownId is provided, search across all trees in that town
            if (search.TownId.HasValue)
            {
                _logger.LogInformation("Searching by TownId: {TownId}", search.TownId);
                (items, totalCount) = await _personRepository.GetPagedByTownAsync(search.TownId.Value, search, cancellationToken);
            }
            else
            {
                // Normal tree-based search
                var (orgId, error) = await ResolveOrgIdAsync(search.TreeId, userContext, cancellationToken);
                if (orgId == null)
                {
                    _logger.LogWarning("ResolveOrgIdAsync returned null: {Error}", error);
                    return ServiceResult<PagedResult<PersonListItemDto>>.Failure(error!);
                }

                _logger.LogInformation("Resolved OrgId: {OrgId}", orgId);

                (items, totalCount) = await _personRepository.GetPagedAsync(orgId.Value, search, cancellationToken);
            }

            var totalPages = (int)Math.Ceiling(totalCount / (double)search.PageSize);

            var result = new PagedResult<PersonListItemDto>(
                items,
                totalCount,
                search.Page,
                search.PageSize,
                totalPages
            );

            return ServiceResult<PagedResult<PersonListItemDto>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting persons for tree {TreeId}. Exception type: {ExceptionType}, Message: {Message}, StackTrace: {StackTrace}",
                search.TreeId, ex.GetType().Name, ex.Message, ex.StackTrace);
            return ServiceResult<PagedResult<PersonListItemDto>>.InternalError("Error loading people");
        }
    }

    public async Task<ServiceResult<PersonResponseDto>> GetPersonAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<PersonResponseDto>.Failure(error!);
            }

            var person = await _personRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);

            if (person == null)
            {
                return ServiceResult<PersonResponseDto>.NotFound("Person not found");
            }

            var dto = _mapper.Map<PersonResponseDto>(person);
            return ServiceResult<PersonResponseDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting person {PersonId} for tree {TreeId}: {Message}", id, treeId, ex.Message);
            return ServiceResult<PersonResponseDto>.InternalError("Error loading person");
        }
    }

    public async Task<ServiceResult<PersonResponseDto>> CreatePersonAsync(
        CreatePersonDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<PersonResponseDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(dto.TreeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonResponseDto>.Failure(error!);
        }

        var person = _mapper.Map<Person>(dto);
        person.OrgId = orgId.Value;
        person.NameArabic = dto.NameArabic;
        person.NameEnglish = dto.NameEnglish;
        person.NameNobiin = dto.NameNobiin;
        person.CreatedAt = DateTime.UtcNow;
        person.UpdatedAt = DateTime.UtcNow;

        // Set primary name from provided names if not explicitly set
        if (string.IsNullOrWhiteSpace(person.PrimaryName))
        {
            person.PrimaryName = dto.NameEnglish ?? dto.NameArabic ?? dto.NameNobiin;
        }

        // Auto-fill the correct language column based on PrimaryName script
        // if no specific language columns are provided
        if (!string.IsNullOrWhiteSpace(person.PrimaryName) &&
            string.IsNullOrWhiteSpace(person.NameArabic) &&
            string.IsNullOrWhiteSpace(person.NameEnglish) &&
            string.IsNullOrWhiteSpace(person.NameNobiin))
        {
            var script = DetectScriptFromContent(person.PrimaryName);
            switch (script)
            {
                case "Arabic":
                    person.NameArabic = person.PrimaryName;
                    break;
                case "English":
                    person.NameEnglish = person.PrimaryName;
                    break;
                case "Nobiin":
                    person.NameNobiin = person.PrimaryName;
                    break;
            }
        }

        _personRepository.Add(person);
        await _personRepository.SaveChangesAsync(cancellationToken);

        // Auto-transliterate to fill in missing name variants
        var sourceName = dto.NameArabic ?? dto.NameEnglish ?? dto.NameNobiin;
        if (!string.IsNullOrWhiteSpace(sourceName))
        {
            await GenerateTransliteratedNamesAsync(person, sourceName, orgId.Value, cancellationToken);
            await _personRepository.SaveChangesAsync(cancellationToken);
        }

        // Reload for response
        var createdPerson = await _personRepository.GetByIdWithDetailsAsync(person.Id, orgId.Value, cancellationToken);

        _logger.LogInformation("Person created: {PersonId} in Org: {OrgId}", person.Id, orgId);

        var responseDto = _mapper.Map<PersonResponseDto>(createdPerson!);
        return ServiceResult<PersonResponseDto>.Success(responseDto);
    }

    public async Task<ServiceResult<PersonResponseDto>> UpdatePersonAsync(
        Guid id,
        UpdatePersonDto dto,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult<PersonResponseDto>.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult<PersonResponseDto>.Failure(error!);
        }

        var person = await _personRepository.GetByIdWithDetailsAsync(id, orgId.Value, cancellationToken);

        if (person == null)
        {
            return ServiceResult<PersonResponseDto>.NotFound("Person not found");
        }

        // Apply partial updates (preserving existing behavior)
        if (dto.PrimaryName != null) person.PrimaryName = dto.PrimaryName;
        if (dto.NameArabic != null) person.NameArabic = dto.NameArabic;
        if (dto.NameEnglish != null) person.NameEnglish = dto.NameEnglish;
        if (dto.NameNobiin != null) person.NameNobiin = dto.NameNobiin;
        if (dto.Sex.HasValue) person.Sex = dto.Sex.Value;
        if (dto.Gender != null) person.Gender = dto.Gender;
        if (dto.BirthDate.HasValue) person.BirthDate = dto.BirthDate;
        if (dto.BirthPrecision.HasValue) person.BirthPrecision = dto.BirthPrecision.Value;
        if (dto.BirthPlaceId.HasValue) person.BirthPlaceId = dto.BirthPlaceId;
        if (dto.DeathDate.HasValue) person.DeathDate = dto.DeathDate;
        if (dto.DeathPrecision.HasValue) person.DeathPrecision = dto.DeathPrecision.Value;
        if (dto.DeathPlaceId.HasValue) person.DeathPlaceId = dto.DeathPlaceId;
        if (dto.PrivacyLevel.HasValue) person.PrivacyLevel = dto.PrivacyLevel.Value;
        if (dto.Occupation != null) person.Occupation = dto.Occupation;
        if (dto.Education != null) person.Education = dto.Education;
        if (dto.Religion != null) person.Religion = dto.Religion;
        if (dto.Nationality != null) person.Nationality = dto.Nationality;
        if (dto.Ethnicity != null) person.Ethnicity = dto.Ethnicity;
        if (dto.Notes != null) person.Notes = dto.Notes;
        if (dto.IsVerified.HasValue) person.IsVerified = dto.IsVerified.Value;
        if (dto.NeedsReview.HasValue) person.NeedsReview = dto.NeedsReview.Value;

        person.UpdatedAt = DateTime.UtcNow;

        await _personRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Person updated: {PersonId}", id);

        var responseDto = _mapper.Map<PersonResponseDto>(person);
        return ServiceResult<PersonResponseDto>.Success(responseDto);
    }

    public async Task<ServiceResult> DeletePersonAsync(
        Guid id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult.Forbidden();
        }

        var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
        if (orgId == null)
        {
            return ServiceResult.Failure(error!);
        }

        var person = await _personRepository.FirstOrDefaultAsync(
            p => p.Id == id && p.OrgId == orgId, cancellationToken);

        if (person == null)
        {
            return ServiceResult.NotFound("Person not found");
        }

        // Check for cross-tree relationships
        if (await _personRepository.HasCrossOrgRelationshipsAsync(id, orgId.Value, cancellationToken))
        {
            _logger.LogWarning("Cannot delete person {PersonId}: has cross-org relationships", id);
            return ServiceResult.Failure("Cannot delete person with relationships to other organizations");
        }

        // Get related records for cascade delete
        var parentChildRecords = await _personRepository.GetParentChildRelationshipsAsync(id, cancellationToken);
        var unionMemberships = await _personRepository.GetUnionMembershipsAsync(id, orgId.Value, cancellationToken);
        var personTags = await _personRepository.GetPersonTagsAsync(id, orgId.Value, cancellationToken);

        // Remove related entities through repository
        await _personRepository.RemoveRelatedEntitiesAsync(parentChildRecords, unionMemberships, personTags, cancellationToken);

        _personRepository.Remove(person);
        await _personRepository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Person deleted: {PersonId} with {ParentChildCount} parent-child links, {UnionCount} union memberships, and {TagCount} tags",
            id, parentChildRecords.Count, unionMemberships.Count, personTags.Count);

        return ServiceResult.Success();
    }

    // ============================================================================
    // AVATAR OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<AvatarDto>> UploadAvatarAsync(
        Guid personId,
        UploadAvatarDto dto,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check authorization
            if (!userContext.CanContribute())
            {
                return ServiceResult<AvatarDto>.Forbidden("You don't have permission to upload avatars");
            }

            // Find the person
            var person = await _personRepository.FirstOrDefaultAsync(
                p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<AvatarDto>.NotFound("Person not found");
            }

            // Validate MIME type
            if (!AllowedAvatarMimeTypes.Contains(dto.MimeType.ToLowerInvariant()))
            {
                return ServiceResult<AvatarDto>.Failure(
                    $"Invalid file type. Allowed types: {string.Join(", ", AllowedAvatarMimeTypes)}");
            }

            // Validate Base64 and check file size
            byte[] fileData;
            try
            {
                var base64 = dto.Base64Data;
                // Remove data URL prefix if present
                if (base64.Contains(','))
                {
                    base64 = base64.Split(',')[1];
                }
                fileData = Convert.FromBase64String(base64);
            }
            catch
            {
                return ServiceResult<AvatarDto>.Failure("Invalid Base64 data");
            }

            if (fileData.Length > MaxAvatarSizeBytes)
            {
                var maxMB = MaxAvatarSizeBytes / (1024 * 1024);
                var actualMB = Math.Round(fileData.Length / (1024.0 * 1024.0), 2);
                return ServiceResult<AvatarDto>.Failure(
                    $"File size ({actualMB} MB) exceeds maximum ({maxMB} MB)");
            }

            // Delete old avatar if exists
            if (person.AvatarMediaId.HasValue)
            {
                await _mediaService.DeleteMediaAsync(person.AvatarMediaId.Value);
                _logger.LogInformation("Deleted old avatar {MediaId} for person {PersonId}",
                    person.AvatarMediaId, personId);
            }

            // Upload new avatar using MediaService
            var media = await _mediaService.UploadMediaAsync(
                personId,
                dto.Base64Data,
                dto.FileName,
                dto.MimeType,
                "Avatar",
                null,
                null
            );

            if (media == null)
            {
                return ServiceResult<AvatarDto>.InternalError("Failed to upload avatar");
            }

            // Update person with new avatar reference
            person.AvatarMediaId = media.Id;
            person.UpdatedAt = DateTime.UtcNow;
            await _personRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Avatar uploaded for person {PersonId}: MediaId={MediaId}",
                personId, media.Id);

            return ServiceResult<AvatarDto>.Success(new AvatarDto
            {
                MediaId = media.Id,
                ThumbnailPath = media.ThumbnailPath,
                Url = media.Url,
                FileName = media.FileName,
                MimeType = media.MimeType,
                FileSize = media.FileSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading avatar for person {PersonId}", personId);
            return ServiceResult<AvatarDto>.InternalError("Error uploading avatar");
        }
    }

    public async Task<ServiceResult<AvatarDto?>> GetAvatarAsync(
        Guid personId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var person = await _personRepository.GetWithAvatarAsync(personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<AvatarDto?>.NotFound("Person not found");
            }

            if (person.Avatar == null)
            {
                return ServiceResult<AvatarDto?>.Success(null);
            }

            return ServiceResult<AvatarDto?>.Success(new AvatarDto
            {
                MediaId = person.Avatar.Id,
                ThumbnailPath = person.Avatar.ThumbnailPath,
                Url = person.Avatar.Url,
                FileName = person.Avatar.FileName,
                MimeType = person.Avatar.MimeType,
                FileSize = person.Avatar.FileSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting avatar for person {PersonId}", personId);
            return ServiceResult<AvatarDto?>.InternalError("Error getting avatar");
        }
    }

    public async Task<ServiceResult<AvatarWithDataDto?>> GetAvatarWithDataAsync(
        Guid personId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var person = await _personRepository.GetWithAvatarAsync(personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<AvatarWithDataDto?>.NotFound("Person not found");
            }

            if (person.Avatar == null)
            {
                return ServiceResult<AvatarWithDataDto?>.Success(null);
            }

            // Get Base64 data
            var base64Data = await _mediaService.GetMediaAsBase64Async(person.Avatar.Id);

            return ServiceResult<AvatarWithDataDto?>.Success(new AvatarWithDataDto
            {
                MediaId = person.Avatar.Id,
                ThumbnailPath = person.Avatar.ThumbnailPath,
                Url = person.Avatar.Url,
                FileName = person.Avatar.FileName,
                MimeType = person.Avatar.MimeType,
                FileSize = person.Avatar.FileSize,
                Base64Data = base64Data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting avatar with data for person {PersonId}", personId);
            return ServiceResult<AvatarWithDataDto?>.InternalError("Error getting avatar");
        }
    }

    public async Task<ServiceResult> DeleteAvatarAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Check authorization
            if (!userContext.CanEdit())
            {
                return ServiceResult.Forbidden("You don't have permission to delete avatars");
            }

            var person = await _personRepository.FirstOrDefaultAsync(
                p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult.NotFound("Person not found");
            }

            if (!person.AvatarMediaId.HasValue)
            {
                return ServiceResult.Success(); // No avatar to delete
            }

            // Delete the media file
            var mediaId = person.AvatarMediaId.Value;
            await _mediaService.DeleteMediaAsync(mediaId);

            // Clear the reference
            person.AvatarMediaId = null;
            person.UpdatedAt = DateTime.UtcNow;
            await _personRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Avatar deleted for person {PersonId}: MediaId={MediaId}",
                personId, mediaId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting avatar for person {PersonId}", personId);
            return ServiceResult.InternalError("Error deleting avatar");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Resolves the effective OrgId based on user role.
    /// Preserves exact behavior from original controller.
    /// </summary>
    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(
        Guid? requestedTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // SuperAdmin can access any tree
        if (userContext.IsSuperAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _orgRepository.ExistsAsync(o => o.Id == requestedTreeId.Value, cancellationToken);
                if (!treeExists)
                {
                    return (null, "The specified tree does not exist.");
                }
                return (requestedTreeId, null);
            }

            // SuperAdmin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            return (null, "SuperAdmin must specify a treeId or be a member of a tree.");
        }

        // Admin can access assigned trees
        if (userContext.IsAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                // Check if admin is assigned to this tree
                var isAssigned = await _orgRepository.IsAdminAssignedToTreeAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isAssigned)
                {
                    return (requestedTreeId, null);
                }

                // Also check if admin is a member of the tree
                var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isMember)
                {
                    return (requestedTreeId, null);
                }

                return (null, "You are not assigned to this tree.");
            }

            // Admin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            // Check if admin has any assignments
            var hasAssignments = await _orgRepository.HasAdminAssignmentsAsync(userContext.UserId, cancellationToken);

            if (hasAssignments)
            {
                return (null, "Admin must specify a treeId to work on an assigned tree.");
            }

            return (null, "You must be assigned to a tree or be a member of one.");
        }

        // Regular user - must be a member
        if (userContext.OrgId == null)
        {
            return (null, "You must be a member of a family tree. Please create or join one first.");
        }

        // If a specific tree was requested, verify membership
        if (requestedTreeId.HasValue && requestedTreeId.Value != userContext.OrgId.Value)
        {
            var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                userContext.UserId, requestedTreeId.Value, cancellationToken);

            if (!isMember)
            {
                return (null, "You are not a member of this tree.");
            }

            return (requestedTreeId, null);
        }

        return (userContext.OrgId, null);
    }

    // ============================================================================
    // AUTO-TRANSLITERATION HELPER
    // ============================================================================

    /// <summary>
    /// Automatically generates transliterated names in other languages.
    /// Sets NameArabic, NameEnglish, and NameNobiin directly on the Person entity.
    /// When you add an Arabic name, it creates English and Nobiin versions.
    /// When you add an English name, it creates Arabic and Nobiin versions.
    /// </summary>
    private async Task GenerateTransliteratedNamesAsync(
        Person person,
        string sourceName,
        Guid orgId,
        CancellationToken cancellationToken)
    {
        if (_transliterationService == null)
        {
            _logger.LogWarning("Transliteration service not available - skipping auto-transliteration");
            return;
        }

        if (string.IsNullOrWhiteSpace(sourceName))
        {
            return;
        }

        // Determine source language from content
        var sourceLanguage = DetectSourceLanguage(null, sourceName);

        try
        {
            var request = new FamilyTreeApi.DTOs.TransliterationRequest
            {
                InputName = sourceName,
                SourceLanguage = sourceLanguage,
                DisplayLanguage = "en",
                OrgId = orgId,
                IsGedImport = false
            };

            var result = await _transliterationService.TransliterateNameAsync(request);

            var namesGenerated = 0;

            // Set Arabic name if not already present and we have a result
            if (string.IsNullOrWhiteSpace(person.NameArabic) &&
                !string.IsNullOrWhiteSpace(result.Arabic) &&
                sourceLanguage != "ar")
            {
                person.NameArabic = result.Arabic;
                namesGenerated++;
                _logger.LogInformation("Auto-generated Arabic name: {Name}", result.Arabic);
            }

            // Set English name if not already present and we have a result
            if (string.IsNullOrWhiteSpace(person.NameEnglish) &&
                !string.IsNullOrWhiteSpace(result.English?.Best) &&
                sourceLanguage != "en")
            {
                person.NameEnglish = result.English.Best;
                namesGenerated++;
                _logger.LogInformation("Auto-generated English name: {Name}", result.English.Best);
            }

            // Set Nobiin name if not already present and we have a result
            if (string.IsNullOrWhiteSpace(person.NameNobiin) &&
                !string.IsNullOrWhiteSpace(result.Nobiin?.Value) &&
                sourceLanguage != "nob")
            {
                person.NameNobiin = result.Nobiin.Value;
                namesGenerated++;
                _logger.LogInformation("Auto-generated Nobiin name: {Name}", result.Nobiin.Value);
            }

            if (namesGenerated > 0)
            {
                _logger.LogInformation(
                    "Auto-generated {Count} transliterated name(s) for person {PersonId}",
                    namesGenerated, person.Id);
            }
        }
        catch (Exception ex)
        {
            // Log but don't fail - transliteration is a nice-to-have
            _logger.LogWarning(ex,
                "Failed to auto-transliterate name '{Name}' for person {PersonId}",
                sourceName, person.Id);
        }
    }

    /// <summary>
    /// Detects source language from script field, with fallback to content-based Unicode detection.
    /// Arabic: U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF
    /// Coptic: U+2C80-U+2CFF, U+0370-U+03FF
    /// </summary>
    private static string DetectSourceLanguage(string? script, string? nameContent)
    {
        // First check script field
        if (!string.IsNullOrWhiteSpace(script))
        {
            var normalized = script.ToLowerInvariant();
            if (normalized is "arabic" or "ar") return "ar";
            if (normalized is "coptic" or "nobiin" or "nob") return "nob";
            if (normalized is "latin" or "english" or "en") return "en";
        }

        // Fallback: detect from content
        if (!string.IsNullOrWhiteSpace(nameContent))
        {
            // Check for Arabic characters
            if (System.Text.RegularExpressions.Regex.IsMatch(nameContent, @"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]"))
                return "ar";

            // Check for Coptic characters
            if (System.Text.RegularExpressions.Regex.IsMatch(nameContent, @"[\u2C80-\u2CFF\u0370-\u03FF]"))
                return "nob";
        }

        return "en"; // Default to English/Latin
    }

    private static string DetectScriptFromContent(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return "English"; // Default

        foreach (var ch in content)
        {
            // Arabic: U+0600 to U+06FF
            if (ch >= '\u0600' && ch <= '\u06FF')
                return "Arabic";

            // Coptic/Nobiin: U+2C80 to U+2CFF
            if (ch >= '\u2C80' && ch <= '\u2CFF')
                return "Nobiin";
        }

        // Default to English/Latin
        return "English";
    }
}

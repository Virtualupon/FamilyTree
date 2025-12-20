// File: Mappings/MappingProfile.cs
using AutoMapper;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Mappings;

/// <summary>
/// AutoMapper profile for all DTO ↔ Entity mappings.
/// No manual mapping should exist in controllers - all mapping goes through AutoMapper.
/// </summary>
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        // ============================================================================
        // PERSON MAPPINGS
        // ============================================================================

        // Person → PersonResponseDto (with navigation properties)
        CreateMap<Person, PersonResponseDto>()
            .ForCtorParam("Id", opt => opt.MapFrom(src => src.Id))
            .ForCtorParam("OrgId", opt => opt.MapFrom(src => src.OrgId))
            .ForCtorParam("PrimaryName", opt => opt.MapFrom(src => src.PrimaryName))
            .ForCtorParam("Sex", opt => opt.MapFrom(src => src.Sex))
            .ForCtorParam("Gender", opt => opt.MapFrom(src => src.Gender))
            .ForCtorParam("BirthDate", opt => opt.MapFrom(src => src.BirthDate))
            .ForCtorParam("BirthPrecision", opt => opt.MapFrom(src => src.BirthPrecision))
            .ForCtorParam("BirthPlaceId", opt => opt.MapFrom(src => src.BirthPlaceId))
            .ForCtorParam("BirthPlace", opt => opt.MapFrom(src => src.BirthPlace != null ? src.BirthPlace.Name : null))
            .ForCtorParam("DeathDate", opt => opt.MapFrom(src => src.DeathDate))
            .ForCtorParam("DeathPrecision", opt => opt.MapFrom(src => src.DeathPrecision))
            .ForCtorParam("DeathPlaceId", opt => opt.MapFrom(src => src.DeathPlaceId))
            .ForCtorParam("DeathPlace", opt => opt.MapFrom(src => src.DeathPlace != null ? src.DeathPlace.Name : null))
            .ForCtorParam("PrivacyLevel", opt => opt.MapFrom(src => src.PrivacyLevel))
            .ForCtorParam("Occupation", opt => opt.MapFrom(src => src.Occupation))
            .ForCtorParam("Education", opt => opt.MapFrom(src => src.Education))
            .ForCtorParam("Religion", opt => opt.MapFrom(src => src.Religion))
            .ForCtorParam("Nationality", opt => opt.MapFrom(src => src.Nationality))
            .ForCtorParam("Ethnicity", opt => opt.MapFrom(src => src.Ethnicity))
            .ForCtorParam("Notes", opt => opt.MapFrom(src => src.Notes))
            .ForCtorParam("IsVerified", opt => opt.MapFrom(src => src.IsVerified))
            .ForCtorParam("NeedsReview", opt => opt.MapFrom(src => src.NeedsReview))
            .ForCtorParam("HasConflict", opt => opt.MapFrom(src => src.HasConflict))
            .ForCtorParam("CreatedAt", opt => opt.MapFrom(src => src.CreatedAt))
            .ForCtorParam("UpdatedAt", opt => opt.MapFrom(src => src.UpdatedAt))
            .ForCtorParam("Names", opt => opt.MapFrom(src => src.Names));

        // Person → PersonListItemDto (for list views)
        CreateMap<Person, PersonListItemDto>()
            .ForCtorParam("Id", opt => opt.MapFrom(src => src.Id))
            .ForCtorParam("PrimaryName", opt => opt.MapFrom(src => src.PrimaryName))
            .ForCtorParam("Sex", opt => opt.MapFrom(src => src.Sex))
            .ForCtorParam("BirthDate", opt => opt.MapFrom(src => src.BirthDate))
            .ForCtorParam("BirthPrecision", opt => opt.MapFrom(src => src.BirthPrecision))
            .ForCtorParam("DeathDate", opt => opt.MapFrom(src => src.DeathDate))
            .ForCtorParam("DeathPrecision", opt => opt.MapFrom(src => src.DeathPrecision))
            .ForCtorParam("BirthPlace", opt => opt.MapFrom(src => src.BirthPlace != null ? src.BirthPlace.Name : null))
            .ForCtorParam("DeathPlace", opt => opt.MapFrom(src => src.DeathPlace != null ? src.DeathPlace.Name : null))
            .ForCtorParam("IsVerified", opt => opt.MapFrom(src => src.IsVerified))
            .ForCtorParam("NeedsReview", opt => opt.MapFrom(src => src.NeedsReview));

        // CreatePersonDto → Person (for creating new persons)
        CreateMap<CreatePersonDto, Person>()
            .ForMember(dest => dest.Id, opt => opt.Ignore()) // Generated
            .ForMember(dest => dest.OrgId, opt => opt.Ignore()) // Set by service
            .ForMember(dest => dest.Org, opt => opt.Ignore())
            .ForMember(dest => dest.Sex, opt => opt.MapFrom(src => src.Sex ?? Sex.Unknown))
            .ForMember(dest => dest.BirthPlace, opt => opt.Ignore())
            .ForMember(dest => dest.DeathPlace, opt => opt.Ignore())
            .ForMember(dest => dest.SearchVector, opt => opt.Ignore())
            .ForMember(dest => dest.HasConflict, opt => opt.Ignore())
            .ForMember(dest => dest.IsVerified, opt => opt.Ignore())
            .ForMember(dest => dest.NeedsReview, opt => opt.Ignore())
            .ForMember(dest => dest.CreatedAt, opt => opt.Ignore()) // Set by service
            .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore()) // Set by service
            .ForMember(dest => dest.Names, opt => opt.Ignore()) // Handled separately
            .ForMember(dest => dest.AsParent, opt => opt.Ignore())
            .ForMember(dest => dest.AsChild, opt => opt.Ignore())
            .ForMember(dest => dest.UnionMemberships, opt => opt.Ignore());

        // ============================================================================
        // PERSON NAME MAPPINGS
        // ============================================================================

        // PersonName → PersonNameDto
        CreateMap<PersonName, PersonNameDto>()
            .ForCtorParam("Id", opt => opt.MapFrom(src => src.Id))
            .ForCtorParam("Script", opt => opt.MapFrom(src => src.Script))
            .ForCtorParam("Given", opt => opt.MapFrom(src => src.Given))
            .ForCtorParam("Middle", opt => opt.MapFrom(src => src.Middle))
            .ForCtorParam("Family", opt => opt.MapFrom(src => src.Family))
            .ForCtorParam("Full", opt => opt.MapFrom(src => src.Full))
            .ForCtorParam("Transliteration", opt => opt.MapFrom(src => src.Transliteration))
            .ForCtorParam("Type", opt => opt.MapFrom(src => src.Type));

        // PersonNameDto → PersonName (for creating/updating names)
        CreateMap<PersonNameDto, PersonName>()
            .ForMember(dest => dest.Id, opt => opt.Ignore()) // Generated for new, preserved for updates
            .ForMember(dest => dest.PersonId, opt => opt.Ignore()) // Set by service
            .ForMember(dest => dest.Person, opt => opt.Ignore())
            .ForMember(dest => dest.Script, opt => opt.MapFrom(src => src.Script ?? "Latin"))
            .ForMember(dest => dest.CreatedAt, opt => opt.Ignore()); // Set by service

        // ============================================================================
        // PERSON MEDIA MAPPINGS
        // Note: PersonMedia is a junction table. DTOs are mapped manually in service
        // because they combine data from PersonMedia + Media + Person entities.
        // ============================================================================

        // PersonMedia → LinkedPersonDto (for linked persons list)
        CreateMap<PersonMedia, LinkedPersonDto>()
            .ForCtorParam("PersonId", opt => opt.MapFrom(src => src.PersonId))
            .ForCtorParam("PersonName", opt => opt.MapFrom(src => src.Person != null ? src.Person.PrimaryName : null))
            .ForCtorParam("IsPrimary", opt => opt.MapFrom(src => src.IsPrimary))
            .ForCtorParam("Notes", opt => opt.MapFrom(src => src.Notes))
            .ForCtorParam("LinkedAt", opt => opt.MapFrom(src => src.LinkedAt));
    }
}

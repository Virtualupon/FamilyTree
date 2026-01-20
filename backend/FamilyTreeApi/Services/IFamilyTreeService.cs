// File: Services/IFamilyTreeService.cs
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Services;

/// <summary>
/// Service interface for Family Tree (Org) CRUD operations.
/// </summary>
public interface IFamilyTreeService
{
    Task<ServiceResult<List<FamilyTreeListItem>>> GetMyTreesAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyTreeResponse>> GetTreeAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyTreeDetailDto>> GetTreeDetailsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyTreeResponse>> CreateTreeAsync(
        CreateFamilyTreeRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyTreeResponse>> UpdateTreeAsync(
        Guid id,
        UpdateFamilyTreeRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteTreeAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // Members
    Task<ServiceResult<List<TreeMemberResponse>>> GetMembersAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TreeMemberResponse>> AddMemberAsync(
        Guid treeId,
        AddTreeMemberRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TreeMemberResponse>> UpdateMemberRoleAsync(
        Guid treeId,
        long userId,
        UpdateTreeMemberRoleRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> RemoveMemberAsync(
        Guid treeId,
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    // Invitations
    Task<ServiceResult<List<TreeInvitationResponse>>> GetInvitationsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<TreeInvitationResponse>> CreateInvitationAsync(
        Guid treeId,
        CreateInvitationRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult<FamilyTreeResponse>> AcceptInvitationAsync(
        string token,
        UserContext userContext,
        CancellationToken cancellationToken = default);

    Task<ServiceResult> DeleteInvitationAsync(
        Guid treeId,
        Guid invitationId,
        UserContext userContext,
        CancellationToken cancellationToken = default);
}

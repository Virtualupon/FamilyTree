// File: Repositories/PersonNameRepository.cs
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// PersonName-specific repository implementation.
/// </summary>
public class PersonNameRepository : Repository<PersonName>, IPersonNameRepository
{
    public PersonNameRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<PersonName?> GetByIdWithPersonAsync(Guid nameId, Guid personId, Guid orgId, CancellationToken cancellationToken = default)
    {
        return await _dbSet
            .Include(n => n.Person)
            .Where(n => n.Id == nameId && n.PersonId == personId && n.Person.OrgId == orgId)
            .FirstOrDefaultAsync(cancellationToken);
    }
}

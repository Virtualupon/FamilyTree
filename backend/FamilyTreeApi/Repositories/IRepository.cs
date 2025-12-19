// File: Repositories/IRepository.cs
using System.Linq.Expressions;

namespace FamilyTreeApi.Repositories;

/// <summary>
/// Generic repository interface for data access abstraction.
/// Designed to support EF Core now, with future support for Dapper/stored procedures.
/// </summary>
public interface IRepository<T> where T : class
{
    // Query operations
    Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<T?> GetByIdAsync(Guid id, params Expression<Func<T, object>>[] includes);
    Task<IEnumerable<T>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, params Expression<Func<T, object>>[] includes);
    Task<bool> ExistsAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default);
    Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken cancellationToken = default);

    // Command operations
    void Add(T entity);
    void AddRange(IEnumerable<T> entities);
    void Update(T entity);
    void Remove(T entity);
    void RemoveRange(IEnumerable<T> entities);

    // Queryable for complex queries (allows service layer to build queries)
    IQueryable<T> Query();
    IQueryable<T> QueryNoTracking();

    // Save changes (unit of work pattern - save is typically called by service)
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

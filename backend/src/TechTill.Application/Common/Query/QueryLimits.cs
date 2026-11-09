using TechTill.Application.Common.Exceptions;

namespace TechTill.Application.Common.Query;

/// <summary>
/// Every rule and sort key deepens the expression tree that EF Core walks recursively, so
/// an unbounded list can overflow the stack and take the whole process down. These limits
/// sit well above anything the grid's rule builder can produce.
/// </summary>
public static class QueryLimits
{
    public const int MaxFilterNodes = 50;
    public const int MaxGroupDepth = 5;
    public const int MaxSortRules = 10;

    public static void EnsureFilters(QueryRequest request)
    {
        var nodes = request.Filters.Count;

        if (request.FilterGroup is not null)
        {
            if (TooDeep(request.FilterGroup, 1))
            {
                throw ValidationFailedException.ForField(
                    nameof(request.FilterGroup),
                    $"Filter groups can nest at most {MaxGroupDepth} levels.");
            }

            nodes += Count(request.FilterGroup);
        }

        if (nodes > MaxFilterNodes)
        {
            throw ValidationFailedException.ForField(
                nameof(request.Filters),
                $"Use at most {MaxFilterNodes} filter rules.");
        }
    }

    public static void EnsureSort(QueryRequest request)
    {
        if (request.Sort.Count > MaxSortRules)
        {
            throw ValidationFailedException.ForField(nameof(request.Sort), $"Sort by at most {MaxSortRules} columns.");
        }
    }

    // The depth check runs first and stops at the limit, so this recursion is always shallow.
    private static bool TooDeep(FilterGroup group, int depth)
        => depth > MaxGroupDepth || group.Groups.Exists(g => TooDeep(g, depth + 1));

    private static int Count(FilterGroup group)
        => group.Rules.Count + group.Groups.Count + group.Groups.Sum(Count);
}

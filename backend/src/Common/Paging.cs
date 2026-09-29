using Microsoft.AspNetCore.Http;

namespace ComercialWeb.Mobile.Common;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, long Total);

/// <summary>Paginação comum às listagens. Valores abusivos são rejeitados (422), não corrigidos em silêncio.</summary>
public readonly record struct Paging(int Page, int PageSize)
{
    public const int MaxPageSize = 50;
    public const int MaxPage = 10_000;
    public const int MaxSearch = 100;

    public int Offset => (Page - 1) * PageSize;

    public static bool TryCreate(int? page, int? pageSize, string? search, out Paging paging)
    {
        paging = new Paging(page ?? 1, pageSize ?? 20);
        return paging.Page is >= 1 and <= MaxPage
            && paging.PageSize is >= 1 and <= MaxPageSize
            && (search is null || search.Length <= MaxSearch);
    }

    public static IResult Invalid() => Results.Problem(statusCode: StatusCodes.Status422UnprocessableEntity);
}

using Microsoft.EntityFrameworkCore;
using TechTill.Application.Common.Query;

namespace TechTill.UnitTests;

public enum RowState
{
    Active = 1,
    Retired = 2
}

public sealed record QueryRow(string? Name, int Qty, decimal Price, DateTime When, RowState State, bool Flag, long? Ref, string Secret);

public class QueryEngineTests
{
    private static readonly DateTime Day = new(2026, 3, 10, 15, 30, 0, DateTimeKind.Utc);

    private static readonly List<QueryRow> Rows =
    [
        new("Laptop Pro", 5, 100m, Day, RowState.Active, true, 1, "x"),
        new("laptop air", 0, 50m, Day.AddDays(1), RowState.Retired, false, null, "y"),
        new("Mouse", 10, 5m, Day.AddDays(2), RowState.Active, true, 3, "z"),
        new("کمپیوٹر یونٹ", 1, 75m, Day.AddDays(3), RowState.Retired, false, 4, "w"),
        new(null, 7, 20m, Day.AddDays(4), RowState.Active, false, 5, "v"),
    ];

    private static readonly QuerySpec<QueryRow> Spec = new QuerySpec<QueryRow>()
        .Text("name", r => r.Name)
        .Map("qty", r => r.Qty)
        .Map("price", r => r.Price)
        .Map("when", r => r.When)
        .Map("state", r => r.State)
        .Map("flag", r => r.Flag)
        .Map("ref", r => r.Ref);

    private static List<string?> Run(QueryRequest request)
        => QueryRunner.RunInMemory(Rows, request with { PageSize = 500 }, Spec).Items.Select(r => r.Name).ToList();

    private static int Count(string field, FilterOperator op, string? value, string? value2 = null)
        => Run(new QueryRequest { Filters = [new FilterRule { Field = field, Operator = op, Value = value, Value2 = value2 }] }).Count;

    [Theory]
    [Trait("AC", "QRY-01")]
    [InlineData("name", FilterOperator.Contains, "LAPTOP", null, 2)]
    [InlineData("name", FilterOperator.Equals, "mouse", null, 1)]
    [InlineData("name", FilterOperator.NotEquals, "mouse", null, 4)]
    [InlineData("name", FilterOperator.StartsWith, "lap", null, 2)]
    [InlineData("name", FilterOperator.EndsWith, "air", null, 1)]
    [InlineData("name", FilterOperator.In, "mouse,laptop air", null, 2)]
    [InlineData("name", FilterOperator.Contains, "کمپیوٹر", null, 1)]
    [InlineData("name", FilterOperator.IsEmpty, null, null, 1)]
    [InlineData("name", FilterOperator.IsNotEmpty, null, null, 4)]
    [InlineData("qty", FilterOperator.Equals, "5", null, 1)]
    [InlineData("qty", FilterOperator.NotEquals, "5", null, 4)]
    [InlineData("qty", FilterOperator.GreaterThan, "5", null, 2)]
    [InlineData("qty", FilterOperator.GreaterThanOrEqual, "5", null, 3)]
    [InlineData("qty", FilterOperator.LessThan, "5", null, 2)]
    [InlineData("qty", FilterOperator.LessThanOrEqual, "5", null, 3)]
    [InlineData("qty", FilterOperator.Between, "1", "7", 3)]
    [InlineData("qty", FilterOperator.In, "0,10", null, 2)]
    [InlineData("price", FilterOperator.GreaterThan, "50.5", null, 2)]
    [InlineData("state", FilterOperator.Equals, "retired", null, 2)]
    [InlineData("flag", FilterOperator.Equals, "true", null, 2)]
    [InlineData("flag", FilterOperator.Equals, "0", null, 3)]
    [InlineData("ref", FilterOperator.IsEmpty, null, null, 1)]
    [InlineData("ref", FilterOperator.IsNotEmpty, null, null, 4)]
    [InlineData("ref", FilterOperator.In, "1,3", null, 2)]
    public void Filter_EachOperatorAndType_MatchesExpectedRows(string field, FilterOperator op, string? value, string? value2, int expected)
        => Assert.Equal(expected, Count(field, op, value, value2));

    [Fact]
    [Trait("AC", "QRY-01")]
    public void Filter_BetweenDates_IncludesTheWholeEndDay()
        => Assert.Equal(2, Count("when", FilterOperator.Between, "2026-03-10", "2026-03-11"));

    [Fact]
    [Trait("AC", "QRY-02")]
    public void Filter_FieldOutsideWhitelist_IsIgnored()
        => Assert.Equal(Rows.Count, Count("secret", FilterOperator.Equals, "x"));

    [Fact]
    [Trait("AC", "QRY-02")]
    public void Sort_FieldOutsideWhitelist_KeepsSourceOrder()
    {
        var names = Run(new QueryRequest { Sort = [new SortRule { Field = "secret", Desc = true }] });
        Assert.Equal(Rows.Select(r => r.Name), names);
    }

    [Fact]
    [Trait("AC", "QRY-02")]
    public void ResolveColumns_UnknownNames_AreDropped()
    {
        var columns = Spec.ResolveColumns(["name", "secret", "QTY"]);
        Assert.Equal(["name", "qty"], columns.Select(c => c.Name));
    }

    [Fact]
    [Trait("AC", "QRY-02")]
    public void ResolveColumns_NothingValid_FallsBackToTheWhitelist()
        => Assert.Equal(Spec.Fields.Count, Spec.ResolveColumns(["secret"]).Count);

    [Fact]
    [Trait("AC", "QRY-03")]
    public void FilterGroup_OrJoin_MatchesEitherRule()
    {
        var names = Run(new QueryRequest
        {
            FilterGroup = new FilterGroup
            {
                Join = FilterJoin.Or,
                Rules =
                [
                    new FilterRule { Field = "qty", Operator = FilterOperator.Equals, Value = "10" },
                    new FilterRule { Field = "qty", Operator = FilterOperator.Equals, Value = "0" },
                ],
            },
        });
        Assert.Equal(2, names.Count);
    }

    [Fact]
    [Trait("AC", "QRY-03")]
    public void FilterGroup_Nested_CombinesLevels()
    {
        var names = Run(new QueryRequest
        {
            FilterGroup = new FilterGroup
            {
                Join = FilterJoin.And,
                Rules = [new FilterRule { Field = "flag", Operator = FilterOperator.Equals, Value = "true" }],
                Groups =
                [
                    new FilterGroup
                    {
                        Join = FilterJoin.Or,
                        Rules =
                        [
                            new FilterRule { Field = "qty", Operator = FilterOperator.Equals, Value = "10" },
                            new FilterRule { Field = "qty", Operator = FilterOperator.Equals, Value = "99" },
                        ],
                    },
                ],
            },
        });
        Assert.Equal(["Mouse"], names);
    }

    [Fact]
    [Trait("AC", "QRY-03")]
    public void FilterGroup_WithColumnFilters_AreJoinedWithAnd()
    {
        var names = Run(new QueryRequest
        {
            Filters = [new FilterRule { Field = "name", Operator = FilterOperator.Contains, Value = "laptop" }],
            FilterGroup = new FilterGroup { Rules = [new FilterRule { Field = "qty", Operator = FilterOperator.Equals, Value = "5" }] },
        });
        Assert.Equal(["Laptop Pro"], names);
    }

    [Fact]
    [Trait("AC", "QRY-03")]
    public void FilterGroup_Empty_ReportsEmpty()
        => Assert.True(new FilterGroup { Groups = [new FilterGroup()] }.IsEmpty);

    [Fact]
    [Trait("AC", "QRY-04")]
    public void Search_MatchesTextFieldsOnlyAndIgnoresCase()
    {
        Assert.Equal(["Mouse"], Run(new QueryRequest { Search = "MOUSE" }));
        Assert.Empty(Run(new QueryRequest { Search = "100" }));
    }

    [Fact]
    [Trait("AC", "QRY-04")]
    public void Search_Blank_ReturnsEverything()
        => Assert.Equal(Rows.Count, Run(new QueryRequest { Search = "   " }).Count);

    [Theory]
    [Trait("AC", "QRY-05")]
    [InlineData(0, 25, 1, 25)]
    [InlineData(-5, 25, 1, 25)]
    [InlineData(1, 0, 1, 25)]
    [InlineData(1, -1, 1, 25)]
    [InlineData(1, 501, 1, 25)]
    [InlineData(1, 500, 1, 500)]
    [InlineData(2, 2, 2, 2)]
    public void Paging_OutOfRangeValues_AreClamped(int page, int size, int expectedPage, int expectedSize)
    {
        var result = QueryRunner.RunInMemory(Rows, new QueryRequest { Page = page, PageSize = size }, Spec);
        Assert.Equal(expectedPage, result.Page);
        Assert.Equal(expectedSize, result.PageSize);
        Assert.Equal(Rows.Count, result.TotalCount);
    }

    [Fact]
    [Trait("AC", "QRY-05")]
    public void TotalPages_ZeroPageSize_IsZero()
        => Assert.Equal(0, new PagedResult<int> { PageSize = 0, TotalCount = 9 }.TotalPages);

    [Fact]
    [Trait("AC", "QRY-06")]
    public async Task Filter_SqlMetacharacters_AreTreatedAsData()
    {
        using var app = new TestApp();
        var payload = "'; DROP TABLE Products; --";

        var result = await app.Products.QueryAsync(new QueryRequest
        {
            Search = payload,
            Filters = [new FilterRule { Field = "name", Operator = FilterOperator.Contains, Value = payload }],
        });

        Assert.Equal(0, result.TotalCount);
        Assert.Equal(2, await app.Saved().Products.CountAsync());
    }

    [Fact]
    [Trait("AC", "QRY-07")]
    public void Sort_Descending_OrdersByField()
    {
        var names = Run(new QueryRequest { Sort = [new SortRule { Field = "qty", Desc = true }] });
        Assert.Equal("Mouse", names[0]);
    }

    [Fact]
    [Trait("AC", "QRY-07")]
    public void Sort_MultipleRules_UsesThenBy()
    {
        var names = Run(new QueryRequest
        {
            Sort =
            [
                new SortRule { Field = "flag", Desc = true },
                new SortRule { Field = "price", Desc = false },
            ],
        });
        Assert.Equal(["Mouse", "Laptop Pro"], names.Take(2));
    }

    [Theory]
    [Trait("AC", "QRY-08")]
    [InlineData("qty", FilterOperator.GreaterThan, "abc", null)]
    [InlineData("qty", FilterOperator.GreaterThan, "99999999999999", null)]
    [InlineData("when", FilterOperator.Equals, "not-a-date", null)]
    [InlineData("state", FilterOperator.Equals, "Nope", null)]
    [InlineData("flag", FilterOperator.Equals, "maybe", null)]
    [InlineData("qty", FilterOperator.Between, "1", null)]
    [InlineData("qty", FilterOperator.Equals, "", null)]
    public void Filter_MalformedValue_IsIgnored(string field, FilterOperator op, string? value, string? value2)
        => Assert.Equal(Rows.Count, Count(field, op, value, value2));

    [Fact]
    [Trait("AC", "QRY-08")]
    public void Filter_InWithNoUsableValues_MatchesEverything()
    {
        Assert.Equal(Rows.Count, Count("name", FilterOperator.In, " , "));
        Assert.Equal(Rows.Count, Count("qty", FilterOperator.In, "x,y"));
    }

    [Fact]
    [Trait("AC", "QRY-07")]
    public void RunInMemoryForExport_AppliesFilterAndSort()
    {
        var rows = QueryRunner.RunInMemoryForExport(
            Rows,
            new QueryRequest
            {
                Filters = [new FilterRule { Field = "flag", Operator = FilterOperator.Equals, Value = "true" }],
                Sort = [new SortRule { Field = "qty", Desc = false }],
            },
            Spec);
        Assert.Equal(["Laptop Pro", "Mouse"], rows.Select(r => r.Name));
    }
}

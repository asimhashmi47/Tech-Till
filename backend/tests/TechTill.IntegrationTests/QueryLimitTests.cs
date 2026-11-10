using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace TechTill.IntegrationTests;

/// <summary>One request used to be able to overflow the stack and kill the process (F01).</summary>
[Collection("api")]
public class QueryLimitTests(SharedApi shared)
{
    private ApiFactory Api => shared.Api;

    private static JsonObject Rule(int i) => new() { ["field"] = "name", ["operator"] = "Contains", ["value"] = $"x{i}" };

    private static JsonObject Rules(int count)
        => new() { ["filters"] = new JsonArray(Enumerable.Range(0, count).Select(i => (JsonNode)Rule(i)).ToArray()) };

    private static JsonObject Nested(int depth)
    {
        var group = new JsonObject { ["join"] = "And", ["rules"] = new JsonArray(Rule(0)), ["groups"] = new JsonArray() };
        for (var level = 1; level < depth; level++)
        {
            group = new JsonObject { ["join"] = "And", ["rules"] = new JsonArray(), ["groups"] = new JsonArray(group) };
        }

        return new JsonObject { ["filterGroup"] = group };
    }

    private static JsonObject Wide(int groups)
    {
        var children = Enumerable.Range(0, groups)
            .Select(_ => (JsonNode)new JsonObject { ["join"] = "And", ["rules"] = new JsonArray(), ["groups"] = new JsonArray() })
            .ToArray();
        return new JsonObject { ["filterGroup"] = new JsonObject { ["join"] = "And", ["rules"] = new JsonArray(Rule(0)), ["groups"] = new JsonArray(children) } };
    }

    private static JsonObject Sorts(int count)
        => new() { ["sort"] = new JsonArray(Enumerable.Range(0, count).Select(_ => (JsonNode)new JsonObject { ["field"] = "name" }).ToArray()) };

    public static TheoryData<string, int> Allowed => new()
    {
        { "rules", 50 },
        { "depth", 5 },
        { "sort", 10 },
    };

    public static TheoryData<string, int> Refused => new()
    {
        { "rules", 51 },
        { "rules", 1000 },
        { "depth", 6 },
        { "depth", 15 },
        { "depth", 31 },
        { "depth", 200 },
        { "wide", 60 },
        { "sort", 11 },
    };

    private static JsonObject Build(string kind, int size) => kind switch
    {
        "rules" => Rules(size),
        "depth" => Nested(size),
        "wide" => Wide(size),
        _ => Sorts(size),
    };

    [Theory]
    [Trait("AC", "QRY-09")]
    [MemberData(nameof(Allowed))]
    public async Task Query_AtTheLimit_Runs(string kind, int size)
    {
        var admin = await Api.AsAsync("admin");
        var response = await admin.PostAsJsonAsync("/api/products/query", Build(kind, size));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [Trait("AC", "QRY-09")]
    [MemberData(nameof(Refused))]
    public async Task Query_OverTheLimit_Returns400(string kind, int size)
    {
        var zoya = await Api.AsAsync("zoya");

        // Sent as text: HttpClient's own serializer refuses to write JSON deeper than 64.
        var json = Build(kind, size).ToJsonString(new System.Text.Json.JsonSerializerOptions { MaxDepth = 1024 });
        var response = await zoya.PostAsync("/api/products/query", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [Trait("AC", "QRY-09")]
    [InlineData("/api/products/export")]
    [InlineData("/api/users/query")]
    [InlineData("/api/users/export")]
    public async Task EveryQueryPath_EnforcesTheLimit(string path)
    {
        var admin = await Api.AsAsync("admin");
        var response = await admin.PostAsJsonAsync(path, Rules(51));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

using System.Net;

namespace TechTill.IntegrationTests;

/// <summary>Stack traces went out in every environment except Production, staging included (F23).</summary>
public class ErrorDetailTests
{
    [Theory]
    [Trait("AC", "API-09")]
    [InlineData("Staging")]
    [InlineData("Testing")]
    public async Task OutsideDevelopment_A500_CarriesNoStackTrace(string environment)
    {
        await using var api = await ApiFactory.StartAsync(environment);
        var admin = await api.AsAsync("admin");

        api.Fault.FailWhenSqlContains = "FROM \"Customers\"";
        var response = await admin.GetAsync("/api/customers/lookup");
        api.Fault.FailWhenSqlContains = null;

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.DoesNotContain("\"exception\"", body, StringComparison.Ordinal);
        Assert.DoesNotContain("   at ", body, StringComparison.Ordinal);
        Assert.Contains("correlationId", body, StringComparison.Ordinal);
    }
}

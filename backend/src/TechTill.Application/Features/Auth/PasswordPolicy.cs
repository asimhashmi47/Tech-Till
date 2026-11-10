namespace TechTill.Application.Features.Auth;

/// <summary>
/// Length matters more than character classes, so there are no composition rules: at least
/// 8 characters, at most 128, not the username, and not one of the passwords tried first.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    private static readonly HashSet<string> Common = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
        "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
        "qwerty12", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "asdfghjk", "zxcvbnm1",
        "abc12345", "abcd1234", "iloveyou", "letmein1", "welcome1", "welcome123", "admin123",
        "administrator", "changeme", "sunshine", "princess", "football", "baseball", "superman",
        "techtill", "techtill1", "techtill123", "techtill#2026", "pakistan", "pakistan123",
    };

    /// <summary>The reason a password is refused, or null when it is acceptable.</summary>
    public static string? Problem(string? password, string? username)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength)
        {
            return $"Use at least {MinLength} characters.";
        }

        if (password.Length > MaxLength)
        {
            return $"Use at most {MaxLength} characters.";
        }

        if (!string.IsNullOrWhiteSpace(username) && password.Equals(username.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return "The password cannot be the username.";
        }

        return Common.Contains(password) ? "That password is one of the first ones attackers try. Pick another." : null;
    }
}

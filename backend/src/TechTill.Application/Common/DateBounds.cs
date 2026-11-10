using TechTill.Application.Common.Exceptions;

namespace TechTill.Application.Common;

/// <summary>
/// Reports bucket by day and load each document in the range, so the range is bounded: a
/// thousand years used to build 72 MB, and a date near DateTime.MaxValue overflowed into a 500.
/// </summary>
public static class DateBounds
{
    public const int MaxRangeDays = 3660;

    public static readonly DateTime Earliest = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    public static readonly DateTime Latest = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static void EnsureRange(DateTime? from, DateTime? to)
    {
        Ensure(from, "From");
        Ensure(to, "To");

        if (from is { } start && to is { } end && Math.Abs((end - start).TotalDays) > MaxRangeDays)
        {
            throw ValidationFailedException.ForField("To", $"Pick a range of at most {MaxRangeDays / 366} years.");
        }
    }

    public const int StaffBackdateDays = 31;

    /// <summary>
    /// Money records may be backdated, which is normal for a late receipt, but not so far that
    /// closed periods quietly change: staff get a month, the owner back to 2000, nobody the future.
    /// </summary>
    public static void EnsureBookable(DateTime date, string field, DateTime now, bool isOwner)
    {
        var day = date.Date;
        var today = now.Date;

        if (day > today.AddDays(1))
        {
            throw ValidationFailedException.ForField(field, "That date is in the future.");
        }

        if (isOwner && day < Earliest)
        {
            throw ValidationFailedException.ForField(field, $"Pick a date from {Earliest:yyyy} on.");
        }

        if (!isOwner && day < today.AddDays(-StaffBackdateDays))
        {
            throw ValidationFailedException.ForField(
                field,
                $"Staff can date an entry at most {StaffBackdateDays} days back. Ask the owner for anything older.");
        }
    }

    private static void Ensure(DateTime? value, string field)
    {
        if (value is { } date && (date < Earliest || date >= Latest))
        {
            throw ValidationFailedException.ForField(field, $"Pick a date between {Earliest:yyyy} and {Latest.Year - 1}.");
        }
    }
}

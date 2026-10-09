using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Blog.Api;

public static partial class Text
{
    public static string Slugify(string title)
    {
        var sb = new StringBuilder();
        foreach (var c in title.Normalize(NormalizationForm.FormD).ToLowerInvariant())
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(c is >= 'a' and <= 'z' or >= '0' and <= '9' ? c : '-');
        }
        var slug = MultiDash().Replace(sb.ToString(), "-").Trim('-');
        if (slug.Length > 80) slug = slug[..80].TrimEnd('-');
        return slug.Length == 0 ? "post" : slug;
    }

    public static string Excerpt(string markdown)
    {
        var text = MarkdownLink().Replace(markdown, "$1");    // [text](url) / ![alt](url) → text
        text = ListMarker().Replace(text, "");                 // "- item", "1. item"
        text = MarkdownSyntax().Replace(text, "");             // #, *, _, `, >, ~
        text = Whitespace().Replace(text, " ").Trim();
        return text.Length <= 200 ? text : text[..200];
    }

    [GeneratedRegex("-{2,}")] private static partial Regex MultiDash();
    [GeneratedRegex(@"!?\[([^\]]*)\]\([^)]*\)")] private static partial Regex MarkdownLink();
    [GeneratedRegex(@"^[ \t]*([-+*]|\d+\.)[ \t]+", RegexOptions.Multiline)] private static partial Regex ListMarker();
    [GeneratedRegex("[#*_`>~]")] private static partial Regex MarkdownSyntax();
    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
}

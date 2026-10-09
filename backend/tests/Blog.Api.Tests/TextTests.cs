namespace Blog.Api.Tests;

public class TextTests
{
    [Theory]
    [InlineData("Hello World", "hello-world")]
    [InlineData("Café à Paris!", "cafe-a-paris")]
    [InlineData("  --Many   spaces & symbols?? ", "many-spaces-symbols")]
    [InlineData("!!!", "post")]
    [InlineData("日本語", "post")]
    public void Slugify(string title, string expected) => Assert.Equal(expected, Text.Slugify(title));

    [Fact]
    public void Slugify_limits_length_to_80()
    {
        var slug = Text.Slugify(new string('a', 50) + " " + new string('b', 50));
        Assert.True(slug.Length <= 80);
        Assert.False(slug.EndsWith('-'));
    }

    [Fact]
    public void Excerpt_strips_markdown()
    {
        var md = "# Title\n\nSome **bold** and _italic_ with a [link](https://x.y).\n\n- item one\n- item two\n\n![pic](a.png)";
        Assert.Equal("Title Some bold and italic with a link. item one item two pic", Text.Excerpt(md));
    }

    [Fact]
    public void Excerpt_is_at_most_200_chars() => Assert.Equal(200, Text.Excerpt(new string('x', 500)).Length);
}

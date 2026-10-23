using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Models;

public class Author : IdentityUser
{
    [MaxLength(100)]
    public required string DisplayName { get; set; }
}

public static class Roles
{
    public const string Owner = "Owner";
}

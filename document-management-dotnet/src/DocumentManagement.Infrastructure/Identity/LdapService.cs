using System.DirectoryServices;
using System.DirectoryServices.Protocols;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Infrastructure.Identity;

public interface ILdapService
{
    Task<bool> AuthenticateAsync(string username, string password);
    Task<LdapUser?> GetUserAsync(string username);
    Task<List<LdapGroup>> GetUserGroupsAsync(string username);
    Task<List<LdapUser>> SearchUsersAsync(string searchFilter, int maxResults = 100);
    Task<bool> IsUserInGroupAsync(string username, string groupName);
}

public class LdapService : ILdapService
{
    private readonly LdapSettings _settings;
    private readonly ILogger<LdapService> _logger;

    public LdapService(IOptions<LdapSettings> settings, ILogger<LdapService> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<bool> AuthenticateAsync(string username, string password)
    {
        try
        {
            using var connection = new LdapConnection(new LdapDirectoryIdentifier(_settings.Server, _settings.Port));
            
            connection.SessionOptions.ProtocolVersion = 3;
            connection.SessionOptions.SecureSocketLayer = _settings.UseSSL;
            
            if (_settings.UseSSL)
            {
                connection.SessionOptions.StartTransportLayerSecurity(null);
            }

            var userDn = GetUserDistinguishedName(username);
            var credential = new NetworkCredential(userDn, password);
            
            connection.Bind(credential);
            
            _logger.LogInformation("LDAP authentication successful for user: {Username}", username);
            return true;
        }
        catch (LdapException ex)
        {
            _logger.LogWarning("LDAP authentication failed for user {Username}: {Error}", username, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during LDAP authentication for user: {Username}", username);
            return false;
        }
    }

    public async Task<LdapUser?> GetUserAsync(string username)
    {
        try
        {
            using var connection = CreateConnection();
            BindAsServiceAccount(connection);

            var searchRequest = new SearchRequest(
                _settings.BaseDn,
                $"(&(objectClass=user)({_settings.UserFilter}={username}))",
                SearchScope.Subtree,
                new[] { "cn", "mail", "displayName", "givenName", "sn", "memberOf", "department", "title" });

            var response = (SearchResponse)connection.SendRequest(searchRequest);

            if (response.Entries.Count == 0)
            {
                _logger.LogWarning("User not found in LDAP: {Username}", username);
                return null;
            }

            var entry = response.Entries[0];
            var user = new LdapUser
            {
                Username = username,
                Email = GetAttributeValue(entry, "mail"),
                DisplayName = GetAttributeValue(entry, "displayName"),
                FirstName = GetAttributeValue(entry, "givenName"),
                LastName = GetAttributeValue(entry, "sn"),
                Department = GetAttributeValue(entry, "department"),
                Title = GetAttributeValue(entry, "title"),
                DistinguishedName = entry.DistinguishedName,
                Groups = GetAttributeValues(entry, "memberOf")
            };

            _logger.LogInformation("Retrieved LDAP user: {Username}", username);
            return user;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while retrieving LDAP user: {Username}", username);
            return null;
        }
    }

    public async Task<List<LdapGroup>> GetUserGroupsAsync(string username)
    {
        try
        {
            var user = await GetUserAsync(username);
            if (user == null)
            {
                return new List<LdapGroup>();
            }

            var groups = new List<LdapGroup>();
            using var connection = CreateConnection();
            BindAsServiceAccount(connection);

            foreach (var groupDn in user.Groups)
            {
                var searchRequest = new SearchRequest(
                    groupDn,
                    "(objectClass=group)",
                    SearchScope.Base,
                    new[] { "cn", "description" });

                try
                {
                    var response = (SearchResponse)connection.SendRequest(searchRequest);
                    if (response.Entries.Count > 0)
                    {
                        var entry = response.Entries[0];
                        groups.Add(new LdapGroup
                        {
                            Name = GetAttributeValue(entry, "cn"),
                            Description = GetAttributeValue(entry, "description"),
                            DistinguishedName = entry.DistinguishedName
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to retrieve group details for DN: {GroupDn}", groupDn);
                }
            }

            return groups;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while retrieving user groups for: {Username}", username);
            return new List<LdapGroup>();
        }
    }

    public async Task<List<LdapUser>> SearchUsersAsync(string searchFilter, int maxResults = 100)
    {
        try
        {
            using var connection = CreateConnection();
            BindAsServiceAccount(connection);

            var filter = string.IsNullOrWhiteSpace(searchFilter) 
                ? "(objectClass=user)" 
                : $"(&(objectClass=user)(|(cn=*{searchFilter}*)(mail=*{searchFilter}*)(displayName=*{searchFilter}*)))";

            var searchRequest = new SearchRequest(
                _settings.BaseDn,
                filter,
                SearchScope.Subtree,
                new[] { "cn", "mail", "displayName", "givenName", "sn", "department", "title" })
            {
                SizeLimit = maxResults
            };

            var response = (SearchResponse)connection.SendRequest(searchRequest);
            var users = new List<LdapUser>();

            foreach (SearchResultEntry entry in response.Entries)
            {
                var user = new LdapUser
                {
                    Username = GetAttributeValue(entry, _settings.UserFilter),
                    Email = GetAttributeValue(entry, "mail"),
                    DisplayName = GetAttributeValue(entry, "displayName"),
                    FirstName = GetAttributeValue(entry, "givenName"),
                    LastName = GetAttributeValue(entry, "sn"),
                    Department = GetAttributeValue(entry, "department"),
                    Title = GetAttributeValue(entry, "title"),
                    DistinguishedName = entry.DistinguishedName
                };

                users.Add(user);
            }

            _logger.LogInformation("Found {Count} users matching search filter: {SearchFilter}", users.Count, searchFilter);
            return users;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while searching LDAP users with filter: {SearchFilter}", searchFilter);
            return new List<LdapUser>();
        }
    }

    public async Task<bool> IsUserInGroupAsync(string username, string groupName)
    {
        try
        {
            var groups = await GetUserGroupsAsync(username);
            return groups.Any(g => g.Name.Equals(groupName, StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while checking if user {Username} is in group {GroupName}", username, groupName);
            return false;
        }
    }

    private LdapConnection CreateConnection()
    {
        var connection = new LdapConnection(new LdapDirectoryIdentifier(_settings.Server, _settings.Port));
        connection.SessionOptions.ProtocolVersion = 3;
        connection.SessionOptions.SecureSocketLayer = _settings.UseSSL;
        
        if (_settings.UseSSL)
        {
            connection.SessionOptions.StartTransportLayerSecurity(null);
        }

        return connection;
    }

    private void BindAsServiceAccount(LdapConnection connection)
    {
        if (!string.IsNullOrEmpty(_settings.ServiceAccountDn) && !string.IsNullOrEmpty(_settings.ServiceAccountPassword))
        {
            var credential = new NetworkCredential(_settings.ServiceAccountDn, _settings.ServiceAccountPassword);
            connection.Bind(credential);
        }
        else
        {
            connection.Bind();
        }
    }

    private string GetUserDistinguishedName(string username)
    {
        return $"{_settings.UserFilter}={username},{_settings.BaseDn}";
    }

    private static string GetAttributeValue(SearchResultEntry entry, string attributeName)
    {
        if (entry.Attributes.ContainsKey(attributeName) && entry.Attributes[attributeName].Count > 0)
        {
            return entry.Attributes[attributeName][0].ToString() ?? string.Empty;
        }
        return string.Empty;
    }

    private static List<string> GetAttributeValues(SearchResultEntry entry, string attributeName)
    {
        var values = new List<string>();
        if (entry.Attributes.ContainsKey(attributeName))
        {
            foreach (var value in entry.Attributes[attributeName])
            {
                if (value != null)
                {
                    values.Add(value.ToString() ?? string.Empty);
                }
            }
        }
        return values;
    }
}

public class LdapSettings
{
    public string Server { get; set; } = string.Empty;
    public int Port { get; set; } = 389;
    public bool UseSSL { get; set; } = false;
    public string BaseDn { get; set; } = string.Empty;
    public string UserFilter { get; set; } = "sAMAccountName";
    public string ServiceAccountDn { get; set; } = string.Empty;
    public string ServiceAccountPassword { get; set; } = string.Empty;
    public int SearchTimeout { get; set; } = 30;
    public bool Enabled { get; set; } = false;
}

public class LdapUser
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string DistinguishedName { get; set; } = string.Empty;
    public List<string> Groups { get; set; } = new();
}

public class LdapGroup
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DistinguishedName { get; set; } = string.Empty;
}
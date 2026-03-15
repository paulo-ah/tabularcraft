namespace Tabularcraft.Sidecar.Models;

public enum AuthMode
{
    Interactive,
    UserPass,
    ServicePrincipal
}

public record ConnectRequest(
    string Server,
    string Database,
    AuthMode AuthMode,
    string? Username = null,
    string? Password = null,
    string? TenantId = null,
    string? AppId = null,
    string? ClientSecret = null
);

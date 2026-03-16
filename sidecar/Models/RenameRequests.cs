namespace Tabularcraft.Sidecar.Models;

public record RenameObjectRequest(
    string Database,
    string ObjectType,
    string OldName,
    string NewName,
    string? Table = null,
    string? Hierarchy = null
);

namespace Tabularcraft.Sidecar.Models;

public record RenameObjectRequest(
    string Database,
    string ObjectType,
    string OldName,
    string NewName,
    string? Table = null,
    string? Hierarchy = null
);

public record DeleteObjectRequest(
    string Database,
    string ObjectType,
    string ObjectName,
    string? Table = null,
    string? Hierarchy = null
);

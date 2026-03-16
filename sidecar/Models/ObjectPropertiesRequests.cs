namespace Tabularcraft.Sidecar.Models;

public record GetObjectPropertiesRequest(
    string Database,
    string ObjectType,
    string ObjectName,
    string? Table = null,
    string? Hierarchy = null
);

public record UpdateObjectPropertiesRequest(
    string Database,
    string ObjectType,
    string ObjectName,
    List<ObjectPropertyUpdate> Updates,
    string? Table = null,
    string? Hierarchy = null
);

public record ObjectPropertyDto(
    string Name,
    string Value,
    bool Editable,
    string Type,
    bool Required,
    List<string>? EnumValues = null
);
public record ObjectPropertyUpdate(string Name, string Value);

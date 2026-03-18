namespace Tabularcraft.Sidecar.Models;

public record CreateDataColumnRequest(
    string Database,
    string Table,
    string Name,
    string SourceColumn,
    string DataType,
    string? DisplayFolder = null,
    string? FormatString = null
);

public record CreateCalculatedColumnRequest(
    string Database,
    string Table,
    string Name,
    string Expression,
    string DataType,
    string? DisplayFolder = null,
    string? FormatString = null
);

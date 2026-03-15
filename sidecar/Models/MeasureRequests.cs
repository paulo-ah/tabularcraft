namespace Tabularcraft.Sidecar.Models;

public record MeasureDto(string Name, string Expression, string? FormatString = null);

public record UpsertMeasureRequest(string Database, string Table, MeasureDto Measure);
public record DeleteMeasureRequest(string Database, string Table, string MeasureName);

namespace Tabularcraft.Sidecar.Models;

public record ProcessDatabaseRequest(string Database);
public record ProcessTableRequest(string Database, string Table);
public record ProcessPartitionRequest(string Database, string Table, string Partition);

public record GetPartitionQueryRequest(string Database, string Table, string Partition);
public record UpdatePartitionQueryRequest(string Database, string Table, string Partition, string Query);
public record PartitionQueryDto(string Query, string QueryType, bool Editable);

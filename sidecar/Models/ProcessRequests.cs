namespace Tabularcraft.Sidecar.Models;

public record ProcessDatabaseRequest(string Database);
public record ProcessTableRequest(string Database, string Table);
public record ProcessPartitionRequest(string Database, string Table, string Partition);

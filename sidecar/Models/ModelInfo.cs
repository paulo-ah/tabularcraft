namespace Tabularcraft.Sidecar.Models;

public record DatabaseInfo(string Name, List<TableInfo> Tables);
public record TableInfo(string Name, List<PartitionInfo> Partitions);
public record PartitionInfo(string Name);

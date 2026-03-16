namespace Tabularcraft.Sidecar.Models;

public record DatabaseInfo(
	string Name,
	List<TableInfo> Tables,
	List<NamedObjectInfo> Roles,
	List<NamedObjectInfo> Perspectives,
	List<NamedObjectInfo> Relationships,
	List<NamedObjectInfo> DataSources,
	List<NamedObjectInfo> Cultures
);

public record TableInfo(
	string Name,
	List<ColumnInfo> Columns,
	List<MeasureInfo> Measures,
	List<HierarchyInfo> Hierarchies,
	List<PartitionInfo> Partitions
);

public record NamedObjectInfo(string Name);
public record ColumnInfo(string Name);
public record MeasureInfo(string Name);
public record HierarchyInfo(string Name, List<LevelInfo> Levels);
public record LevelInfo(string Name);
public record PartitionInfo(string Name);

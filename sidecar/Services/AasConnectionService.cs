using Microsoft.AnalysisServices;
using Microsoft.AnalysisServices.Tabular;
using Microsoft.Identity.Client;
using System.Reflection;
using Tabularcraft.Sidecar.Models;
using TomServer = Microsoft.AnalysisServices.Tabular.Server;

namespace Tabularcraft.Sidecar.Services;

/// <summary>
/// Single-connection wrapper over TOM.
/// All public members are thread-safe via a simple lock because the
/// extension issues sequential requests.
/// </summary>
public sealed class AasConnectionService : IDisposable
{
    private static readonly string[] AasScopes = ["https://*.asazure.windows.net/.default"];
    // Public client used by local/dev tools for interactive sign-in.
    private const string PublicClientId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

    private readonly object _lock = new();
    private TomServer? _server;
    private ConnectRequest? _config;

    private static readonly string[] CommonProperties = ["Name", "Description", "IsHidden"];
    private static readonly HashSet<string> RequiredStringProperties =
    [
        "Expression"
    ];

    // -------------------------------------------------------------------------
    // Connection management
    // -------------------------------------------------------------------------

    public void Connect(ConnectRequest request)
    {
        lock (_lock)
        {
            // Disconnect any existing session first
            DisconnectCore();

            var connectionString = BuildConnectionString(request);
            _server = new TomServer();

            if (request.AuthMode == AuthMode.Interactive)
            {
                var token = AcquireInteractiveAccessToken();
                _server.AccessToken = new AccessToken(token.AccessToken, token.ExpiresOn);
            }

            _server.Connect(connectionString);
            _config = request;
        }
    }

    public void TestConnection(ConnectRequest request)
    {
        // Use a temporary server instance so we do not alter the active extension session.
        using var testServer = new TomServer();
        var connectionString = BuildConnectionString(request);

        if (request.AuthMode == AuthMode.Interactive)
        {
            var token = AcquireInteractiveAccessToken();
            testServer.AccessToken = new AccessToken(token.AccessToken, token.ExpiresOn);
        }

        testServer.Connect(connectionString);
        try
        {
            _ = testServer.Connected;
        }
        finally
        {
            testServer.Disconnect();
        }
    }

    public void Disconnect()
    {
        lock (_lock) { DisconnectCore(); }
    }

    public bool IsConnected
    {
        get
        {
            lock (_lock)
            {
                return _server is { Connected: true };
            }
        }
    }

    // -------------------------------------------------------------------------
    // Model browsing
    // -------------------------------------------------------------------------

    public List<DatabaseInfo> GetDatabases()
    {
        lock (_lock)
        {
            AssertConnected();
            var result = new List<DatabaseInfo>();
            foreach (Microsoft.AnalysisServices.Tabular.Database db in _server!.Databases)
            {
                var tables = new List<TableInfo>();
                var roles = new List<NamedObjectInfo>();
                var perspectives = new List<NamedObjectInfo>();
                var relationships = new List<NamedObjectInfo>();
                var dataSources = new List<NamedObjectInfo>();
                var cultures = new List<NamedObjectInfo>();

                if (db.Model is not null)
                {
                    foreach (Microsoft.AnalysisServices.Tabular.Table tbl in db.Model.Tables)
                    {
                        var columns = tbl.Columns
                            .Cast<Microsoft.AnalysisServices.Tabular.Column>()
                            .Where(c => c.Type != Microsoft.AnalysisServices.Tabular.ColumnType.RowNumber)
                            .Select(c => new ColumnInfo(c.Name))
                            .ToList();

                        var measures = tbl.Measures
                            .Cast<Microsoft.AnalysisServices.Tabular.Measure>()
                            .Select(m => new MeasureInfo(m.Name))
                            .ToList();

                        var hierarchies = tbl.Hierarchies
                            .Cast<Microsoft.AnalysisServices.Tabular.Hierarchy>()
                            .Select(h =>
                                new HierarchyInfo(
                                    h.Name,
                                    h.Levels
                                        .Cast<Microsoft.AnalysisServices.Tabular.Level>()
                                        .Select(l => new LevelInfo(l.Name))
                                        .ToList()
                                )
                            )
                            .ToList();

                        var partitions = tbl.Partitions
                            .Cast<Microsoft.AnalysisServices.Tabular.Partition>()
                            .Select(p => new PartitionInfo(p.Name))
                            .ToList();

                        tables.Add(new TableInfo(tbl.Name, columns, measures, hierarchies, partitions));
                    }

                    roles = db.Model.Roles
                        .Cast<Microsoft.AnalysisServices.Tabular.ModelRole>()
                        .Select(r => new NamedObjectInfo(r.Name))
                        .ToList();

                    perspectives = db.Model.Perspectives
                        .Cast<Microsoft.AnalysisServices.Tabular.Perspective>()
                        .Select(p => new NamedObjectInfo(p.Name))
                        .ToList();

                    relationships = db.Model.Relationships
                        .Cast<Microsoft.AnalysisServices.Tabular.SingleColumnRelationship>()
                        .Select(r =>
                            new NamedObjectInfo(
                                string.IsNullOrWhiteSpace(r.Name)
                                    ? $"{r.FromTable.Name}[{r.FromColumn.Name}] -> {r.ToTable.Name}[{r.ToColumn.Name}]"
                                    : r.Name
                            )
                        )
                        .ToList();

                    dataSources = db.Model.DataSources
                        .Cast<Microsoft.AnalysisServices.Tabular.DataSource>()
                        .Select(ds => new NamedObjectInfo(ds.Name))
                        .ToList();

                    cultures = db.Model.Cultures
                        .Cast<Microsoft.AnalysisServices.Tabular.Culture>()
                        .Select(c => new NamedObjectInfo(c.Name))
                        .ToList();
                }

                result.Add(new DatabaseInfo(db.Name, tables, roles, perspectives, relationships, dataSources, cultures));
            }
            return result;
        }
    }

    // -------------------------------------------------------------------------
    // Processing
    // -------------------------------------------------------------------------

    public void ProcessDatabase(string databaseName)
    {
        lock (_lock)
        {
            var db = GetDatabase(databaseName);
            db.Model.RequestRefresh(Microsoft.AnalysisServices.Tabular.RefreshType.Full);
            db.Model.SaveChanges();
        }
    }

    public void ProcessTable(string databaseName, string tableName)
    {
        lock (_lock)
        {
            var tbl = GetTable(databaseName, tableName);
            tbl.RequestRefresh(Microsoft.AnalysisServices.Tabular.RefreshType.Full);
            tbl.Model.SaveChanges();
        }
    }

    public void ProcessPartition(string databaseName, string tableName, string partitionName)
    {
        lock (_lock)
        {
            var tbl = GetTable(databaseName, tableName);
            var partition = tbl.Partitions.Find(partitionName)
                ?? throw new InvalidOperationException($"Partition '{partitionName}' not found in table '{tableName}'.");
            partition.RequestRefresh(Microsoft.AnalysisServices.Tabular.RefreshType.Full);
            tbl.Model.SaveChanges();
        }
    }

    public void RenameObject(RenameObjectRequest request)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(request.NewName))
            {
                throw new InvalidOperationException("New name is required.");
            }

            var oldName = request.OldName.Trim();
            var newName = request.NewName.Trim();
            if (string.Equals(oldName, newName, StringComparison.Ordinal))
            {
                return;
            }

            var db = GetDatabase(request.Database);
            var model = db.Model ?? throw new InvalidOperationException("Model metadata is not available.");

            switch (request.ObjectType.Trim().ToLowerInvariant())
            {
                case "table":
                {
                    var table = model.Tables.Find(oldName)
                        ?? throw new InvalidOperationException($"Table '{oldName}' not found.");
                    table.Name = newName;
                    break;
                }
                case "column":
                {
                    var table = GetTable(request.Database, RequireTable(request));
                    var column = table.Columns.Find(oldName)
                        ?? throw new InvalidOperationException($"Column '{oldName}' not found in table '{table.Name}'.");
                    column.Name = newName;
                    break;
                }
                case "measure":
                {
                    var table = GetTable(request.Database, RequireTable(request));
                    var measure = table.Measures.Find(oldName)
                        ?? throw new InvalidOperationException($"Measure '{oldName}' not found in table '{table.Name}'.");
                    measure.Name = newName;
                    break;
                }
                case "hierarchy":
                {
                    var table = GetTable(request.Database, RequireTable(request));
                    var hierarchy = table.Hierarchies.Find(oldName)
                        ?? throw new InvalidOperationException($"Hierarchy '{oldName}' not found in table '{table.Name}'.");
                    hierarchy.Name = newName;
                    break;
                }
                case "level":
                {
                    var table = GetTable(request.Database, RequireTable(request));
                    var hierarchyName = RequireHierarchy(request);
                    var hierarchy = table.Hierarchies.Find(hierarchyName)
                        ?? throw new InvalidOperationException($"Hierarchy '{hierarchyName}' not found in table '{table.Name}'.");
                    var level = hierarchy.Levels.Find(oldName)
                        ?? throw new InvalidOperationException($"Level '{oldName}' not found in hierarchy '{hierarchy.Name}'.");
                    level.Name = newName;
                    break;
                }
                case "partition":
                {
                    var table = GetTable(request.Database, RequireTable(request));
                    var partition = table.Partitions.Find(oldName)
                        ?? throw new InvalidOperationException($"Partition '{oldName}' not found in table '{table.Name}'.");
                    partition.Name = newName;
                    break;
                }
                case "role":
                {
                    var role = model.Roles.Find(oldName)
                        ?? throw new InvalidOperationException($"Role '{oldName}' not found.");
                    role.Name = newName;
                    break;
                }
                case "perspective":
                {
                    var perspective = model.Perspectives.Find(oldName)
                        ?? throw new InvalidOperationException($"Perspective '{oldName}' not found.");
                    perspective.Name = newName;
                    break;
                }
                case "data-source":
                {
                    var dataSource = model.DataSources.Find(oldName)
                        ?? throw new InvalidOperationException($"Data source '{oldName}' not found.");
                    dataSource.Name = newName;
                    break;
                }
                case "culture":
                {
                    var culture = model.Cultures.Find(oldName)
                        ?? throw new InvalidOperationException($"Culture '{oldName}' not found.");
                    culture.Name = newName;
                    break;
                }
                default:
                    throw new InvalidOperationException($"Rename for object type '{request.ObjectType}' is not supported.");
            }

            model.SaveChanges();
        }
    }

    public List<ObjectPropertyDto> GetObjectProperties(GetObjectPropertiesRequest request)
    {
        lock (_lock)
        {
            var target = ResolveObject(
                request.Database,
                request.ObjectType,
                request.ObjectName,
                request.Table,
                request.Hierarchy
            );

            var propertyNames = GetPropertyListForType(request.ObjectType);
            var result = new List<ObjectPropertyDto>();

            foreach (var propertyName in propertyNames)
            {
                var prop = target.GetType().GetProperty(propertyName);
                if (prop is null || !prop.CanRead)
                {
                    continue;
                }

                var value = prop.GetValue(target);
                var typeName = GetPropertyTypeName(prop.PropertyType);
                var editable = prop.CanWrite && !string.Equals(propertyName, "Name", StringComparison.Ordinal);
                var required = IsPropertyRequired(prop);
                var enumValues = GetEnumValues(prop.PropertyType);

                result.Add(
                    new ObjectPropertyDto(
                        propertyName,
                        ConvertValueToString(value),
                        editable,
                        typeName,
                        required,
                        enumValues
                    )
                );
            }

            return result;
        }
    }

    public void UpdateObjectProperties(UpdateObjectPropertiesRequest request)
    {
        lock (_lock)
        {
            var target = ResolveObject(
                request.Database,
                request.ObjectType,
                request.ObjectName,
                request.Table,
                request.Hierarchy
            );

            foreach (var update in request.Updates)
            {
                if (string.Equals(update.Name, "Name", StringComparison.Ordinal))
                {
                    continue;
                }

                var prop = target.GetType().GetProperty(update.Name);
                if (prop is null || !prop.CanWrite)
                {
                    continue;
                }

                var converted = ConvertStringToPropertyValue(update.Value, prop.PropertyType);
                prop.SetValue(target, converted);
            }

            var db = GetDatabase(request.Database);
            var model = db.Model ?? throw new InvalidOperationException("Model metadata is not available.");
            model.SaveChanges();
        }
    }

    // -------------------------------------------------------------------------
    // Measures
    // -------------------------------------------------------------------------

    public List<MeasureDto> GetMeasures(string databaseName, string tableName)
    {
        lock (_lock)
        {
            var tbl = GetTable(databaseName, tableName);
            return tbl.Measures
                .Cast<Microsoft.AnalysisServices.Tabular.Measure>()
                .Select(m => new MeasureDto(m.Name, m.Expression, m.FormatString))
                .ToList();
        }
    }

    public void UpsertMeasure(string databaseName, string tableName, MeasureDto dto)
    {
        lock (_lock)
        {
            var tbl = GetTable(databaseName, tableName);
            var existing = tbl.Measures.Find(dto.Name);
            if (existing is not null)
            {
                existing.Expression = dto.Expression;
                if (dto.FormatString is not null) existing.FormatString = dto.FormatString;
            }
            else
            {
                var m = new Microsoft.AnalysisServices.Tabular.Measure
                {
                    Name = dto.Name,
                    Expression = dto.Expression,
                };
                if (dto.FormatString is not null) m.FormatString = dto.FormatString;
                tbl.Measures.Add(m);
            }
            tbl.Model.SaveChanges();
        }
    }

    public void DeleteMeasure(string databaseName, string tableName, string measureName)
    {
        lock (_lock)
        {
            var tbl = GetTable(databaseName, tableName);
            var m = tbl.Measures.Find(measureName)
                ?? throw new InvalidOperationException($"Measure '{measureName}' not found.");
            tbl.Measures.Remove(m);
            tbl.Model.SaveChanges();
        }
    }

    // -------------------------------------------------------------------------
    // TMSL
    // -------------------------------------------------------------------------

    public string ExecuteTmsl(string script)
    {
        lock (_lock)
        {
            AssertConnected();
            // Execute via XMLA using the underlying Server object
            var results = _server!.Execute(script);
            var messages = results
                .Cast<XmlaResult>()
                .SelectMany(r => r.Messages.OfType<XmlaMessage>())
                .Select(m => m.Description)
                .ToList();

            if (results.ContainsErrors)
            {
                var errors = string.Join("; ", messages);
                throw new InvalidOperationException($"TMSL execution failed: {errors}");
            }
            return messages.Count > 0
                ? string.Join("\n", messages)
                : "OK";
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private static string BuildConnectionString(ConnectRequest request)
    {
        return request.AuthMode switch
        {
            AuthMode.Interactive =>
                $"Data Source={request.Server};Catalog={request.Database};Provider=MSOLAP;Integrated Security=ClaimsToken",
            AuthMode.UserPass =>
                $"Data Source={request.Server};Catalog={request.Database};User ID={request.Username};Password={request.Password}",
            AuthMode.ServicePrincipal =>
                $"Data Source={request.Server};Catalog={request.Database};User ID=app:{request.AppId}@{request.TenantId};Password={request.ClientSecret}",
            _ => throw new ArgumentOutOfRangeException(nameof(request.AuthMode))
        };
    }

    private static AuthenticationResult AcquireInteractiveAccessToken()
    {
        try
        {
            var app = PublicClientApplicationBuilder
                .Create(PublicClientId)
                .WithAuthority(AzureCloudInstance.AzurePublic, AadAuthorityAudience.AzureAdMultipleOrgs)
                .WithDefaultRedirectUri()
                .Build();

            return app
                .AcquireTokenInteractive(AasScopes)
                .WithPrompt(Prompt.SelectAccount)
                .ExecuteAsync()
                .GetAwaiter()
                .GetResult();
        }
        catch (MsalException ex)
        {
            throw new InvalidOperationException($"Interactive sign-in failed: {ex.Message}", ex);
        }
    }

    private void AssertConnected()
    {
        if (_server is not { Connected: true })
            throw new InvalidOperationException("Not connected to AAS. Call /connection/connect first.");
    }

    private Microsoft.AnalysisServices.Tabular.Database GetDatabase(string name)
    {
        AssertConnected();
        return _server!.Databases.FindByName(name)
            ?? throw new InvalidOperationException($"Database '{name}' not found.");
    }

    private Microsoft.AnalysisServices.Tabular.Table GetTable(string databaseName, string tableName)
    {
        var db = GetDatabase(databaseName);
        return db.Model?.Tables.Find(tableName)
            ?? throw new InvalidOperationException($"Table '{tableName}' not found in database '{databaseName}'.");
    }

    private object ResolveObject(
        string database,
        string objectType,
        string objectName,
        string? tableName,
        string? hierarchyName)
    {
        var db = GetDatabase(database);
        var model = db.Model ?? throw new InvalidOperationException("Model metadata is not available.");

        var typeKey = objectType.Trim().ToLowerInvariant();
        return typeKey switch
        {
            "database" => db,
            "table" => model.Tables.Find(objectName)
                ?? throw new InvalidOperationException($"Table '{objectName}' not found."),
            "column" => GetTable(database, RequireValue(tableName, "Table")).Columns.Find(objectName)
                ?? throw new InvalidOperationException($"Column '{objectName}' not found."),
            "measure" => GetTable(database, RequireValue(tableName, "Table")).Measures.Find(objectName)
                ?? throw new InvalidOperationException($"Measure '{objectName}' not found."),
            "hierarchy" => GetTable(database, RequireValue(tableName, "Table")).Hierarchies.Find(objectName)
                ?? throw new InvalidOperationException($"Hierarchy '{objectName}' not found."),
            "level" => ResolveLevel(database, RequireValue(tableName, "Table"), RequireValue(hierarchyName, "Hierarchy"), objectName),
            "partition" => GetTable(database, RequireValue(tableName, "Table")).Partitions.Find(objectName)
                ?? throw new InvalidOperationException($"Partition '{objectName}' not found."),
            "role" => model.Roles.Find(objectName)
                ?? throw new InvalidOperationException($"Role '{objectName}' not found."),
            "perspective" => model.Perspectives.Find(objectName)
                ?? throw new InvalidOperationException($"Perspective '{objectName}' not found."),
            "data-source" => model.DataSources.Find(objectName)
                ?? throw new InvalidOperationException($"Data source '{objectName}' not found."),
            "culture" => model.Cultures.Find(objectName)
                ?? throw new InvalidOperationException($"Culture '{objectName}' not found."),
            _ => throw new InvalidOperationException($"Object type '{objectType}' is not supported."),
        };
    }

    private Microsoft.AnalysisServices.Tabular.Level ResolveLevel(
        string database,
        string tableName,
        string hierarchyName,
        string levelName)
    {
        var table = GetTable(database, tableName);
        var hierarchy = table.Hierarchies.Find(hierarchyName)
            ?? throw new InvalidOperationException($"Hierarchy '{hierarchyName}' not found in table '{tableName}'.");
        return hierarchy.Levels.Find(levelName)
            ?? throw new InvalidOperationException($"Level '{levelName}' not found in hierarchy '{hierarchyName}'.");
    }

    private static IEnumerable<string> GetPropertyListForType(string objectType)
    {
        var specific = objectType.Trim().ToLowerInvariant() switch
        {
            "column" => new[] { "DataType", "SourceColumn", "FormatString", "SummarizeBy" },
            "measure" => new[] { "Expression", "FormatString", "DisplayFolder" },
            "partition" => new[] { "Mode", "State" },
            "table" => new[] { "DataCategory", "DefaultDetailRowsDefinitionExpression", "ShowAsVariationsOnly" },
            _ => Array.Empty<string>(),
        };

        return CommonProperties.Concat(specific);
    }

    private static string ConvertValueToString(object? value)
    {
        if (value is null)
        {
            return string.Empty;
        }

        return value switch
        {
            bool b => b ? "true" : "false",
            Enum e => e.ToString(),
            _ => value.ToString() ?? string.Empty,
        };
    }

    private static object? ConvertStringToPropertyValue(string value, Type targetType)
    {
        var nonNullable = Nullable.GetUnderlyingType(targetType) ?? targetType;

        if (nonNullable == typeof(string))
        {
            return value;
        }

        if (string.IsNullOrWhiteSpace(value) && Nullable.GetUnderlyingType(targetType) is not null)
        {
            return null;
        }

        if (nonNullable == typeof(bool))
        {
            if (!bool.TryParse(value, out var parsed))
            {
                throw new InvalidOperationException($"Value '{value}' is not a valid boolean.");
            }
            return parsed;
        }

        if (nonNullable.IsEnum)
        {
            try
            {
                return Enum.Parse(nonNullable, value, ignoreCase: true);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Value '{value}' is not valid for enum '{nonNullable.Name}'.", ex);
            }
        }

        try
        {
            return Convert.ChangeType(value, nonNullable);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Could not convert '{value}' to '{nonNullable.Name}'.", ex);
        }
    }

    private static string GetPropertyTypeName(Type type)
    {
        var nonNullable = Nullable.GetUnderlyingType(type) ?? type;
        if (nonNullable == typeof(bool)) return "boolean";
        if (nonNullable.IsEnum) return "enum";
        if (nonNullable == typeof(int) || nonNullable == typeof(long) || nonNullable == typeof(double) || nonNullable == typeof(decimal)) return "number";
        return "string";
    }

    private static bool IsPropertyRequired(PropertyInfo prop)
    {
        var nonNullable = Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType;
        if (nonNullable == typeof(string))
        {
            return RequiredStringProperties.Contains(prop.Name);
        }

        // Non-nullable value types always need a value.
        return Nullable.GetUnderlyingType(prop.PropertyType) is null && nonNullable.IsValueType;
    }

    private static List<string>? GetEnumValues(Type type)
    {
        var nonNullable = Nullable.GetUnderlyingType(type) ?? type;
        return nonNullable.IsEnum
            ? Enum.GetNames(nonNullable).ToList()
            : null;
    }

    private static string RequireValue(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"{name} is required.");
        return value.Trim();
    }

    private static string RequireTable(RenameObjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Table))
            throw new InvalidOperationException("Table is required for this rename operation.");
        return request.Table.Trim();
    }

    private static string RequireHierarchy(RenameObjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Hierarchy))
            throw new InvalidOperationException("Hierarchy is required for level rename operations.");
        return request.Hierarchy.Trim();
    }

    private void DisconnectCore()
    {
        if (_server is not null)
        {
            try { _server.Disconnect(); } catch { /* best-effort */ }
            _server.Dispose();
            _server = null;
        }
        _config = null;
    }

    public void Dispose() => DisconnectCore();
}

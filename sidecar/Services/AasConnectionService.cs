using Microsoft.AnalysisServices;
using Microsoft.AnalysisServices.Tabular;
using Microsoft.Identity.Client;
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
    private readonly object _lock = new();
    private TomServer? _server;
    private ConnectRequest? _config;

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
            _server.Connect(connectionString);
            _config = request;
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
                if (db.Model is not null)
                {
                    foreach (Microsoft.AnalysisServices.Tabular.Table tbl in db.Model.Tables)
                    {
                        var partitions = tbl.Partitions
                            .Cast<Microsoft.AnalysisServices.Tabular.Partition>()
                            .Select(p => new PartitionInfo(p.Name))
                            .ToList();
                        tables.Add(new TableInfo(tbl.Name, partitions));
                    }
                }
                result.Add(new DatabaseInfo(db.Name, tables));
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

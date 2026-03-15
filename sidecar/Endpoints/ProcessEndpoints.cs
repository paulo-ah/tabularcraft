using Tabularcraft.Sidecar.Models;
using Tabularcraft.Sidecar.Services;

namespace Tabularcraft.Sidecar.Endpoints;

public static class ProcessEndpoints
{
    public static void MapProcessEndpoints(this WebApplication app)
    {
        app.MapPost("/process/database", (ProcessDatabaseRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.ProcessDatabase(request.Database);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/process/table", (ProcessTableRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.ProcessTable(request.Database, request.Table);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/process/partition", (ProcessPartitionRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.ProcessPartition(request.Database, request.Table, request.Partition);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }
}

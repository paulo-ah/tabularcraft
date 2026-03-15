using Tabularcraft.Sidecar.Models;
using Tabularcraft.Sidecar.Services;

namespace Tabularcraft.Sidecar.Endpoints;

public static class MeasureEndpoints
{
    public static void MapMeasureEndpoints(this WebApplication app)
    {
        app.MapGet("/measures", (string database, string table, AasConnectionService svc) =>
        {
            try
            {
                return Results.Ok(svc.GetMeasures(database, table));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/measures/upsert", (UpsertMeasureRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.UpsertMeasure(request.Database, request.Table, request.Measure);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        app.MapPost("/measures/delete", (DeleteMeasureRequest request, AasConnectionService svc) =>
        {
            try
            {
                svc.DeleteMeasure(request.Database, request.Table, request.MeasureName);
                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }
}
